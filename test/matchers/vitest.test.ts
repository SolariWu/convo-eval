import { describe, it, expect, beforeAll } from "vitest";
import { installMatchers } from "../../src/matchers/vitest.js";
import type { AgentFunction, LLMFunction } from "../../src/types.js";

beforeAll(() => {
  installMatchers();
});

const mockAgent: AgentFunction = async () => ({
  text: "I can help with that!",
  toolCalls: [],
});

const mockSimulatorLLM: LLMFunction = async () => "</finished>";

describe("toPassConversationScenario", () => {
  it("passes when all evaluators pass", async () => {
    await expect(mockAgent).toPassConversationScenario(
      { startingPrompt: "Help me", conversationPlan: "Get assistance", maxTurns: 2 },
      {
        simulatorLLM: mockSimulatorLLM,
        evaluators: [{
          name: "mock-eval",
          async evaluate() { return { evaluator: "mock-eval", score: 1.0, pass: true, reason: "OK" }; },
        }],
        threshold: 0.8,
      }
    );
  });

  it("fails when an evaluator fails", async () => {
    await expect(async () => {
      await expect(mockAgent).toPassConversationScenario(
        { startingPrompt: "Help", conversationPlan: "Plan", maxTurns: 2 },
        {
          simulatorLLM: mockSimulatorLLM,
          evaluators: [{
            name: "fail-eval",
            async evaluate() { return { evaluator: "fail-eval", score: 0.1, pass: false, reason: "Bad" }; },
          }],
          threshold: 0.8,
        }
      );
    }).rejects.toThrow();
  });
});
