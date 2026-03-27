import { describe, it, expect } from "vitest";
import { createTrajectoryEvaluator } from "../../src/evaluators/trajectory.js";
import type { SimulationResult, ConversationScenario, ToolCall } from "../../src/types.js";

function makeResult(toolCallsByTurn: ToolCall[][]): SimulationResult {
  return {
    turns: toolCallsByTurn.map((tc, i) => ({
      index: i,
      userMessage: `msg ${i}`,
      agentResponse: `resp ${i}`,
      toolCalls: tc,
      durationMs: 100,
    })),
    planCompleted: true,
    terminationReason: "max_turns",
    tokenUsage: { simulator: 0, agent: 0 },
  };
}

const scenario: ConversationScenario = {
  startingPrompt: "Hello",
  conversationPlan: "Do stuff",
};

describe("trajectory evaluator", () => {
  // ── exact mode ──

  it("exact match: perfect match scores 1.0", async () => {
    const evaluator = createTrajectoryEvaluator({
      expected: [
        { name: "search", args: { query: "foo" } },
        { name: "save", args: { id: 1 } },
      ],
      matchMode: "exact",
    });
    const result = makeResult([
      [
        { name: "search", args: { query: "foo" } },
        { name: "save", args: { id: 1 } },
      ],
    ]);
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(1.0);
    expect(evalResult.pass).toBe(true);
    expect(evaluator.name).toBe("tool-trajectory");
  });

  it("exact match: wrong order scores 0", async () => {
    const evaluator = createTrajectoryEvaluator({
      expected: [
        { name: "search", args: { query: "foo" } },
        { name: "save", args: { id: 1 } },
      ],
      matchMode: "exact",
    });
    const result = makeResult([
      [
        { name: "save", args: { id: 1 } },
        { name: "search", args: { query: "foo" } },
      ],
    ]);
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBeLessThan(1.0);
  });

  it("exact match: extra calls scores 0", async () => {
    const evaluator = createTrajectoryEvaluator({
      expected: [
        { name: "search", args: { query: "foo" } },
      ],
      matchMode: "exact",
    });
    const result = makeResult([
      [
        { name: "search", args: { query: "foo" } },
        { name: "extra", args: {} },
      ],
    ]);
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(0);
    expect(evalResult.pass).toBe(false);
  });

  // ── in_order mode ──

  it("in_order: expected tools in order with interleaved extras scores 1.0", async () => {
    const evaluator = createTrajectoryEvaluator({
      expected: [
        { name: "search", args: { query: "foo" } },
        { name: "save", args: { id: 1 } },
      ],
      matchMode: "in_order",
    });
    const result = makeResult([
      [
        { name: "search", args: { query: "foo" } },
        { name: "log", args: {} },
        { name: "save", args: { id: 1 } },
      ],
    ]);
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(1.0);
    expect(evalResult.pass).toBe(true);
  });

  it("in_order: partial match scores fractionally", async () => {
    const evaluator = createTrajectoryEvaluator({
      expected: [
        { name: "search", args: { query: "foo" } },
        { name: "save", args: { id: 1 } },
        { name: "notify", args: {} },
      ],
      matchMode: "in_order",
    });
    const result = makeResult([
      [
        { name: "search", args: { query: "foo" } },
        { name: "save", args: { id: 1 } },
      ],
    ]);
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBeCloseTo(2 / 3);
  });

  // ── any_order mode ──

  it("any_order: all expected present in any order scores 1.0", async () => {
    const evaluator = createTrajectoryEvaluator({
      expected: [
        { name: "search", args: { query: "foo" } },
        { name: "save", args: { id: 1 } },
      ],
      matchMode: "any_order",
    });
    const result = makeResult([
      [
        { name: "save", args: { id: 1 } },
        { name: "search", args: { query: "foo" } },
      ],
    ]);
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(1.0);
    expect(evalResult.pass).toBe(true);
  });

  // ── partial args matching ──

  it("partial args: expected args are subset of actual args", async () => {
    const evaluator = createTrajectoryEvaluator({
      expected: [{ name: "search", args: { query: "foo" } }],
      matchMode: "exact",
    });
    const result = makeResult([
      [{ name: "search", args: { query: "foo", limit: 10, extra: "bar" } }],
    ]);
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(1.0);
  });

  it("partial args: mismatched arg values fail", async () => {
    const evaluator = createTrajectoryEvaluator({
      expected: [{ name: "search", args: { query: "foo" } }],
      matchMode: "exact",
    });
    const result = makeResult([
      [{ name: "search", args: { query: "bar" } }],
    ]);
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(0);
  });

  // ── threshold ──

  it("threshold: passes when score meets threshold", async () => {
    const evaluator = createTrajectoryEvaluator({
      expected: [
        { name: "search", args: {} },
        { name: "save", args: {} },
      ],
      matchMode: "any_order",
      threshold: 0.5,
    });
    const result = makeResult([
      [{ name: "search", args: {} }],
    ]);
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(0.5);
    expect(evalResult.pass).toBe(true);
  });

  // ── multi-turn ──

  it("collects tool calls across multiple turns", async () => {
    const evaluator = createTrajectoryEvaluator({
      expected: [
        { name: "search", args: { query: "foo" } },
        { name: "save", args: { id: 1 } },
      ],
      matchMode: "in_order",
    });
    const result = makeResult([
      [{ name: "search", args: { query: "foo" } }],
      [{ name: "save", args: { id: 1 } }],
    ]);
    const evalResult = await evaluator.evaluate(result, scenario);
    expect(evalResult.score).toBe(1.0);
    expect(evalResult.pass).toBe(true);
  });
});
