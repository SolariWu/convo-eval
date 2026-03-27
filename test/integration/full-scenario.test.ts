import { describe, it, expect } from "vitest";
import {
  simulate,
  evaluate,
  createPlanCompletionEvaluator,
  createResponseQualityEvaluator,
  EXPERT,
} from "../../src/index.js";
import type { AgentFunction, LLMFunction, LLMMessage } from "../../src/types.js";

// ── Provider selection ─────────────────────────────────────
// Supports: ANTHROPIC_API_KEY (direct) or OPENROUTER_KEY (via OpenRouter)

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY ?? process.env.OPENROUTER_API_KEY;
const SKIP = !ANTHROPIC_KEY && !OPENROUTER_KEY;
const PROVIDER = ANTHROPIC_KEY ? "anthropic" : "openrouter";

// Model IDs differ between providers
const HAIKU_MODEL = PROVIDER === "openrouter"
  ? "anthropic/claude-haiku-4.5"
  : "claude-haiku-4-5-20251001";

// ── OpenRouter helper ──────────────────────────────────────

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function openRouterChat(
  messages: OpenRouterMessage[],
  model: string
): Promise<{ text: string; tokenUsage: number }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as any;
  const text = data.choices?.[0]?.message?.content ?? "";
  const tokenUsage = data.usage?.completion_tokens ?? 0;
  return { text, tokenUsage };
}

// ── Sanitize messages for Anthropic (must alternate, start with user) ──

function sanitizeForAnthropic(
  chatMessages: Array<{ role: "user" | "assistant"; content: string }>
): Array<{ role: "user" | "assistant"; content: string }> {
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
  return sanitized;
}

// ── Build LLMFunction + AgentFunction for whichever provider is available ──

function buildLLMFunction(): LLMFunction {
  if (PROVIDER === "openrouter") {
    return async (messages: LLMMessage[]) => {
      const orMessages: OpenRouterMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      return openRouterChat(orMessages, HAIKU_MODEL);
    };
  }

  // Anthropic direct
  // Dynamic import to avoid hard failure when @anthropic-ai/sdk is not installed
  let anthropicInstance: any = null;
  return async (messages: LLMMessage[]) => {
    if (!anthropicInstance) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      anthropicInstance = new Anthropic();
    }
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const sanitized = sanitizeForAnthropic(chatMessages);

    const response = await anthropicInstance.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: systemMsg?.content,
      messages: sanitized,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return { text, tokenUsage: response.usage.output_tokens };
  };
}

function buildAgentFunction(): AgentFunction {
  if (PROVIDER === "openrouter") {
    return async (message, history) => {
      const messages: OpenRouterMessage[] = [
        {
          role: "system",
          content: "You are a helpful travel assistant. Help users book flights and answer travel questions. Be concise.",
        },
      ];
      for (const turn of history) {
        messages.push({ role: "user", content: turn.userMessage });
        messages.push({ role: "assistant", content: turn.agentResponse });
      }
      messages.push({ role: "user", content: message });

      const { text } = await openRouterChat(messages, HAIKU_MODEL);
      return { text, toolCalls: [] };
    };
  }

  // Anthropic direct
  let anthropicInstance: any = null;
  return async (message, history) => {
    if (!anthropicInstance) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      anthropicInstance = new Anthropic();
    }
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const turn of history) {
      messages.push({ role: "user", content: turn.userMessage });
      messages.push({ role: "assistant", content: turn.agentResponse });
    }
    messages.push({ role: "user", content: message });

    const response = await anthropicInstance.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: "You are a helpful travel assistant. Help users book flights and answer travel questions. Be concise.",
      messages,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return { text, toolCalls: [] };
  };
}

// ── Test ────────────────────────────────────────────────────

describe.skipIf(SKIP)(`integration: full scenario with Claude (${PROVIDER})`, () => {
  const llmFn = buildLLMFunction();
  const agentFn = buildAgentFunction();

  it(
    "runs a full scenario: simulate + evaluate",
    async () => {
      const result = await simulate({
        scenario: {
          startingPrompt:
            "I need to fly from San Francisco to Los Angeles next Tuesday morning. What are my options?",
          conversationPlan:
            "Ask about flights from SFO to LAX for next Tuesday morning. Prefer flights under $200. If the agent suggests options, pick the cheapest one.",
          userPersona: EXPERT,
          maxTurns: 5,
        },
        agentFn,
        simulatorLLM: llmFn,
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
            createPlanCompletionEvaluator({ judgeLLM: llmFn, threshold: 0.3 }),
            createResponseQualityEvaluator({
              judgeLLM: llmFn,
              rubric:
                "The agent should be helpful, relevant, and provide travel-related information.",
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

      console.log(`Integration test results (provider: ${PROVIDER}):`);
      console.log(`  Turns: ${result.turns.length}`);
      console.log(`  Plan completed: ${result.planCompleted}`);
      console.log(`  Overall: ${summary.overall}`);
      for (const e of summary.evaluators) {
        console.log(
          `  ${e.evaluator}: ${e.score.toFixed(2)} (${e.pass ? "PASS" : "FAIL"}) — ${e.reason}`
        );
      }
    },
    { timeout: 120_000 }
  );
});
