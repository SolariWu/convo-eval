import { describe, it, expect } from "vitest";
import { simulate } from "../src/runner.js";
import type { AgentFunction, LLMFunction } from "../src/types.js";

describe("simulate", () => {
  it("collects turns into SimulationResult", async () => {
    const agentFn: AgentFunction = async () => ({ text: "Agent response", toolCalls: [] });
    const simulatorLLM: LLMFunction = async () => "</finished>";
    const result = await simulate({
      scenario: { startingPrompt: "Hello", conversationPlan: "Greet and finish", maxTurns: 3 },
      agentFn,
      simulatorLLM,
    });
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].userMessage).toBe("Hello");
    expect(result.planCompleted).toBe(true);
    expect(result.terminationReason).toBe("stop_signal");
  });

  it("reports max_turns when plan not completed", async () => {
    let callCount = 0;
    const agentFn: AgentFunction = async () => ({ text: `Response ${++callCount}`, toolCalls: [] });
    const simulatorLLM: LLMFunction = async () => "Another question";
    const result = await simulate({
      scenario: { startingPrompt: "Start", conversationPlan: "Keep asking", maxTurns: 3 },
      agentFn,
      simulatorLLM,
    });
    expect(result.turns).toHaveLength(3);
    expect(result.planCompleted).toBe(false);
    expect(result.terminationReason).toBe("max_turns");
  });

  it("aggregates simulator token usage", async () => {
    const agentFn: AgentFunction = async () => ({ text: "Response", toolCalls: [] });
    const simulatorLLM: LLMFunction = async () => ({ text: "</finished>", tokenUsage: 100 });
    const result = await simulate({
      scenario: { startingPrompt: "Start", conversationPlan: "Plan", maxTurns: 3 },
      agentFn,
      simulatorLLM,
    });
    expect(result.tokenUsage.simulator).toBe(100);
  });

  it("reports error termination when agent throws", async () => {
    const agentFn: AgentFunction = async () => { throw new Error("Agent failed"); };
    const simulatorLLM: LLMFunction = async () => "Question";
    const result = await simulate({
      scenario: { startingPrompt: "Start", conversationPlan: "Plan", maxTurns: 3 },
      agentFn,
      simulatorLLM,
    });
    expect(result.terminationReason).toBe("error");
    expect(result.planCompleted).toBe(false);
  });
});
