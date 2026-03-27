import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  simulate,
  evaluate,
  createPlanCompletionEvaluator,
  createResponseQualityEvaluator,
  EXPERT,
} from "../../src/index.js";
import type { AgentFunction, LLMFunction } from "../../src/types.js";

const SKIP = !process.env.ANTHROPIC_API_KEY;

describe.skipIf(SKIP)("integration: full scenario with Claude", () => {
  const anthropic = new Anthropic();

  const claudeLLM: LLMFunction = async (messages) => {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Ensure messages alternate and start with user
    const sanitized: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const msg of chatMessages) {
      if (sanitized.length === 0 && msg.role !== "user") {
        sanitized.push({ role: "user", content: "(start)" });
      }
      if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === msg.role) {
        sanitized[sanitized.length - 1].content += "\n" + msg.content;
      } else {
        sanitized.push({ ...msg });
      }
    }
    if (sanitized.length === 0) {
      sanitized.push({ role: "user", content: "(start)" });
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemMsg?.content,
      messages: sanitized,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return { text, tokenUsage: response.usage.output_tokens };
  };

  const agentFn: AgentFunction = async (message, history) => {
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const turn of history) {
      messages.push({ role: "user", content: turn.userMessage });
      messages.push({ role: "assistant", content: turn.agentResponse });
    }
    messages.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: "You are a helpful travel assistant. Help users book flights and answer travel questions. Be concise.",
      messages,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return { text, toolCalls: [] };
  };

  it(
    "runs a full scenario: simulate + evaluate",
    async () => {
      const result = await simulate({
        scenario: {
          startingPrompt: "I need to fly from San Francisco to Los Angeles next Tuesday morning. What are my options?",
          conversationPlan: "Ask about flights from SFO to LAX for next Tuesday morning. Prefer flights under $200. If the agent suggests options, pick the cheapest one.",
          userPersona: EXPERT,
          maxTurns: 5,
        },
        agentFn,
        simulatorLLM: claudeLLM,
      });

      expect(result.turns.length).toBeGreaterThanOrEqual(1);
      expect(result.turns[0].userMessage).toContain("San Francisco");
      expect(result.tokenUsage.simulator).toBeGreaterThanOrEqual(0);

      const summary = await evaluate(
        result,
        {
          startingPrompt: result.turns[0].userMessage,
          conversationPlan: "Ask about flights from SFO to LAX",
          userPersona: EXPERT,
        },
        {
          evaluators: [
            createPlanCompletionEvaluator({ judgeLLM: claudeLLM, threshold: 0.3 }),
            createResponseQualityEvaluator({
              judgeLLM: claudeLLM,
              rubric: "The agent should be helpful, relevant, and provide travel-related information.",
              threshold: 0.3,
            }),
          ],
        }
      );

      expect(summary.evaluators).toHaveLength(2);
      for (const evalResult of summary.evaluators) {
        expect(evalResult.score).toBeGreaterThanOrEqual(0);
        expect(evalResult.score).toBeLessThanOrEqual(1);
        expect(evalResult.reason).toBeTruthy();
      }

      console.log("Integration test results:");
      console.log(`  Turns: ${result.turns.length}`);
      console.log(`  Plan completed: ${result.planCompleted}`);
      console.log(`  Overall: ${summary.overall}`);
      for (const e of summary.evaluators) {
        console.log(`  ${e.evaluator}: ${e.score.toFixed(2)} (${e.pass ? "PASS" : "FAIL"}) — ${e.reason}`);
      }
    },
    { timeout: 120_000 }
  );
});
