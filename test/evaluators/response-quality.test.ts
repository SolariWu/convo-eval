import { describe, it, expect } from "vitest";
import { createResponseQualityEvaluator } from "../../src/evaluators/response-quality.js";
import type { SimulationResult, ConversationScenario, LLMFunction } from "../../src/types.js";

const scenario: ConversationScenario = {
  startingPrompt: "Hello",
  conversationPlan: "Help user",
};

describe("response-quality evaluator", () => {
  it("averages per-turn scores (0.8 + 0.6 = 0.7 avg)", async () => {
    let callIndex = 0;
    const mockLLM: LLMFunction = async () => {
      const scores = [0.8, 0.6];
      const score = scores[callIndex++];
      return JSON.stringify({ score, reason: `Turn scored ${score}` });
    };

    const evaluator = createResponseQualityEvaluator({
      judgeLLM: mockLLM,
      rubric: "Be helpful and clear",
      threshold: 0.5,
    });
    expect(evaluator.name).toBe("response-quality");

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "Q1", agentResponse: "A1", toolCalls: [], durationMs: 100 },
        { index: 1, userMessage: "Q2", agentResponse: "A2", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "max_turns",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(0.7);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.perTurn).toHaveLength(2);
    expect(evalResult.perTurn![0].score).toBe(0.8);
    expect(evalResult.perTurn![1].score).toBe(0.6);
  });

  it("handles single turn", async () => {
    const mockLLM: LLMFunction = async () =>
      JSON.stringify({ score: 0.9, reason: "Good response" });

    const evaluator = createResponseQualityEvaluator({
      judgeLLM: mockLLM,
      rubric: "Be helpful",
      threshold: 0.7,
    });

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "Q1", agentResponse: "A1", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "max_turns",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(0.9);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.perTurn).toHaveLength(1);
  });
});
