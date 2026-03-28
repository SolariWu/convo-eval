import { describe, it, expect } from "vitest";
import { createPersonaAdherenceEvaluator } from "../../src/evaluators/persona-adherence.js";
import type { SimulationResult, ConversationScenario, LLMFunction } from "../../src/types.js";

const result: SimulationResult = {
  turns: [
    { index: 0, userMessage: "Hello, I need help", agentResponse: "Sure!", toolCalls: [], durationMs: 100 },
    { index: 1, userMessage: "Can you help me with X?", agentResponse: "Of course", toolCalls: [], durationMs: 100 },
  ],
  planCompleted: true,
  terminationReason: "max_turns",
  tokenUsage: { simulator: 0, agent: 0 },
};

describe("persona-adherence evaluator", () => {
  it("scores 1.0 when persona is maintained", async () => {
    const mockLLM: LLMFunction = async () =>
      JSON.stringify({ score: 1.0, reason: "Persona maintained" });

    const evaluator = createPersonaAdherenceEvaluator({ judgeLLM: mockLLM, threshold: 0.8 });
    expect(evaluator.name).toBe("persona-adherence");

    const scenario: ConversationScenario = {
      startingPrompt: "Hello",
      conversationPlan: "Test plan",
      userPersona: {
        name: "polite-user",
        description: "Always polite",
        behaviors: [
          {
            name: "politeness",
            description: "Speaks politely",
            violationRubrics: ["The message is rude or aggressive"],
          },
        ],
      },
    };

    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(1.0);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.perTurn).toHaveLength(2);
  });

  it("returns 1.0 when no persona is defined", async () => {
    const mockLLM: LLMFunction = async () =>
      JSON.stringify({ score: 0.5, reason: "Should not be called" });

    const evaluator = createPersonaAdherenceEvaluator({ judgeLLM: mockLLM });

    const scenario: ConversationScenario = {
      startingPrompt: "Hello",
      conversationPlan: "Test plan",
    };

    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(1.0);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.reason).toBe("No persona defined");
  });
});
