import { describe, it, expect } from "vitest";
import { createKnowledgeRetentionEvaluator } from "../../src/evaluators/knowledge-retention.js";
import type { SimulationResult, ConversationScenario, LLMFunction } from "../../src/types.js";

const scenario: ConversationScenario = {
  startingPrompt: "Hello",
  conversationPlan: "Test knowledge retention",
};

describe("knowledge-retention evaluator", () => {
  it("evaluates retention across turns", async () => {
    let callIndex = 0;
    const mockLLM: LLMFunction = async () => {
      callIndex++;
      if (callIndex === 1) {
        // First call: extract facts
        return JSON.stringify({ facts: ["User's name is Alice", "User likes cats"] });
      }
      // Subsequent calls: judge retention per turn
      return JSON.stringify({ score: 0.8, reason: "Facts mostly retained" });
    };

    const evaluator = createKnowledgeRetentionEvaluator({ judgeLLM: mockLLM, threshold: 0.7 });
    expect(evaluator.name).toBe("knowledge-retention");

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "My name is Alice and I like cats", agentResponse: "Nice to meet you Alice!", toolCalls: [], durationMs: 100 },
        { index: 1, userMessage: "What do I like?", agentResponse: "You like cats!", toolCalls: [], durationMs: 100 },
        { index: 2, userMessage: "What is my name?", agentResponse: "Your name is Alice", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "max_turns",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(0.8);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.perTurn).toBeDefined();
    expect(evalResult.perTurn!.length).toBe(2); // turns 1..N
  });

  it("handles single turn by returning 1.0", async () => {
    const mockLLM: LLMFunction = async () =>
      JSON.stringify({ score: 0.5, reason: "Should not be called" });

    const evaluator = createKnowledgeRetentionEvaluator({ judgeLLM: mockLLM });

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "Hello", agentResponse: "Hi!", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "max_turns",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(1.0);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.reason).toContain("single turn");
  });
});
