import { describe, it, expect } from "vitest";
import { evaluate } from "../src/evaluate.js";
import { defineEvaluator } from "../src/evaluators/index.js";
import type { SimulationResult, ConversationScenario } from "../src/types.js";

const scenario: ConversationScenario = { startingPrompt: "Hi", conversationPlan: "Greet" };
const result: SimulationResult = {
  turns: [{ index: 0, userMessage: "Hi", agentResponse: "Hello!", toolCalls: [], durationMs: 100 }],
  planCompleted: true,
  terminationReason: "stop_signal",
  tokenUsage: { simulator: 0, agent: 0 },
};

describe("defineEvaluator", () => {
  it("creates an evaluator from a config object", async () => {
    const ev = defineEvaluator({
      name: "custom",
      async evaluate() { return { score: 0.9, pass: true, reason: "Good" }; },
    });
    expect(ev.name).toBe("custom");
    const evalResult = await ev.evaluate(result, scenario);
    expect(evalResult.evaluator).toBe("custom");
    expect(evalResult.score).toBe(0.9);
  });
});

describe("evaluate", () => {
  it("runs all evaluators and returns summary", async () => {
    const ev1 = defineEvaluator({
      name: "always-pass",
      async evaluate() { return { score: 1.0, pass: true, reason: "Pass" }; },
    });
    const ev2 = defineEvaluator({
      name: "always-fail",
      async evaluate() { return { score: 0.0, pass: false, reason: "Fail" }; },
    });
    const summary = await evaluate(result, scenario, { evaluators: [ev1, ev2] });
    expect(summary.overall).toBe("FAIL");
    expect(summary.evaluators).toHaveLength(2);
    expect(summary.evaluators[0].evaluator).toBe("always-pass");
    expect(summary.evaluators[1].evaluator).toBe("always-fail");
  });

  it("reports PASS when all evaluators pass", async () => {
    const ev = defineEvaluator({
      name: "pass",
      async evaluate() { return { score: 0.9, pass: true, reason: "OK" }; },
    });
    const summary = await evaluate(result, scenario, { evaluators: [ev] });
    expect(summary.overall).toBe("PASS");
  });

  it("runs evaluators in parallel", async () => {
    const order: string[] = [];
    const ev1 = defineEvaluator({
      name: "slow",
      async evaluate() {
        await new Promise((r) => setTimeout(r, 50));
        order.push("slow");
        return { score: 1.0, pass: true, reason: "OK" };
      },
    });
    const ev2 = defineEvaluator({
      name: "fast",
      async evaluate() {
        order.push("fast");
        return { score: 1.0, pass: true, reason: "OK" };
      },
    });
    await evaluate(result, scenario, { evaluators: [ev1, ev2] });
    expect(order[0]).toBe("fast");
  });
});
