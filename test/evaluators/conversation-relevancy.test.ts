import { describe, it, expect } from "vitest";
import { createConversationRelevancyEvaluator } from "../../src/evaluators/conversation-relevancy.js";
import type { SimulationResult, ConversationScenario, LLMFunction } from "../../src/types.js";

const scenario: ConversationScenario = {
  startingPrompt: "Hello",
  conversationPlan: "Discuss weather",
};

describe("conversation-relevancy evaluator", () => {
  it("evaluates with sliding window", async () => {
    let callCount = 0;
    const mockLLM: LLMFunction = async () => {
      callCount++;
      return JSON.stringify({ score: 0.9, reason: "Relevant response" });
    };

    const evaluator = createConversationRelevancyEvaluator({
      judgeLLM: mockLLM,
      threshold: 0.7,
      windowSize: 2,
    });
    expect(evaluator.name).toBe("conversation-relevancy");

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "What is the weather?", agentResponse: "It is sunny", toolCalls: [], durationMs: 100 },
        { index: 1, userMessage: "Will it rain?", agentResponse: "No rain expected", toolCalls: [], durationMs: 100 },
        { index: 2, userMessage: "What about tomorrow?", agentResponse: "Cloudy tomorrow", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "max_turns",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(0.9);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.perTurn).toHaveLength(3);
    expect(callCount).toBe(3); // one LLM call per turn
  });

  it("uses default window size of 3", async () => {
    const prompts: string[] = [];
    const mockLLM: LLMFunction = async (messages) => {
      prompts.push(messages[0].content);
      return JSON.stringify({ score: 1.0, reason: "On topic" });
    };

    const evaluator = createConversationRelevancyEvaluator({
      judgeLLM: mockLLM,
      threshold: 0.7,
    });

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "T0 user", agentResponse: "T0 agent", toolCalls: [], durationMs: 100 },
        { index: 1, userMessage: "T1 user", agentResponse: "T1 agent", toolCalls: [], durationMs: 100 },
        { index: 2, userMessage: "T2 user", agentResponse: "T2 agent", toolCalls: [], durationMs: 100 },
        { index: 3, userMessage: "T3 user", agentResponse: "T3 agent", toolCalls: [], durationMs: 100 },
        { index: 4, userMessage: "T4 user", agentResponse: "T4 agent", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "max_turns",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(1.0);
    expect(evalResult.perTurn).toHaveLength(5);

    // Turn 4 context should include turns 1,2,3 (window=3), NOT turn 0
    const lastPrompt = prompts[4];
    expect(lastPrompt).toContain("T1 user");
    expect(lastPrompt).toContain("T3 agent");
    expect(lastPrompt).not.toContain("T0 user");
  });
});
