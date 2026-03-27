import { describe, it, expect } from "vitest";
import { createPlanCompletionEvaluator } from "../../src/evaluators/plan-completion.js";
import type { SimulationResult, ConversationScenario, LLMFunction } from "../../src/types.js";

const scenario: ConversationScenario = {
  startingPrompt: "Hello",
  conversationPlan: "Help user book a flight",
};

const result: SimulationResult = {
  turns: [
    { index: 0, userMessage: "Book me a flight", agentResponse: "Done! Booked.", toolCalls: [], durationMs: 100 },
  ],
  planCompleted: true,
  terminationReason: "max_turns",
  tokenUsage: { simulator: 0, agent: 0 },
};

describe("plan-completion evaluator", () => {
  it("passes with a high score from judge LLM", async () => {
    const mockLLM: LLMFunction = async () =>
      JSON.stringify({ score: 0.9, reason: "All goals achieved" });

    const evaluator = createPlanCompletionEvaluator({ judgeLLM: mockLLM, threshold: 0.7 });
    expect(evaluator.name).toBe("plan-completion");

    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(0.9);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.reason).toBe("All goals achieved");
  });

  it("fails with a low score from judge LLM", async () => {
    const mockLLM: LLMFunction = async () =>
      JSON.stringify({ score: 0.2, reason: "Goals not met" });

    const evaluator = createPlanCompletionEvaluator({ judgeLLM: mockLLM, threshold: 0.7 });
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(0.2);
    expect(evalResult.pass).toBe(false);
    expect(evalResult.reason).toBe("Goals not met");
  });

  it("handles malformed LLM response gracefully", async () => {
    const mockLLM: LLMFunction = async () => "This is not JSON at all";

    const evaluator = createPlanCompletionEvaluator({ judgeLLM: mockLLM, threshold: 0.7 });
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(0);
    expect(evalResult.pass).toBe(false);
    expect(evalResult.reason).toContain("parse error");
  });
});
