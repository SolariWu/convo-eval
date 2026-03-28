import { describe, it, expect } from "vitest";
import { UserSimulator } from "../src/simulator.js";
import type { AgentFunction, LLMFunction, Turn } from "../src/types.js";

function createMockSimulatorLLM(responses: string[]): LLMFunction {
  let callIndex = 0;
  return async () => {
    const response = responses[callIndex] ?? "</finished>";
    callIndex++;
    return response;
  };
}

function createMockAgent(responses: string[]): AgentFunction {
  let callIndex = 0;
  return async () => {
    const text = responses[callIndex] ?? "Default response";
    callIndex++;
    return { text, toolCalls: [] };
  };
}

describe("UserSimulator", () => {
  it("executes turn 0 with startingPrompt", async () => {
    const agent = createMockAgent(["Agent response 1"]);
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(["</finished>"]),
    });
    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Hello", conversationPlan: "Greet the agent", maxTurns: 1 },
      agent
    )) {
      turns.push(turn);
    }
    expect(turns).toHaveLength(1);
    expect(turns[0].index).toBe(0);
    expect(turns[0].userMessage).toBe("Hello");
    expect(turns[0].agentResponse).toBe("Agent response 1");
  });

  it("runs multiple turns until stop signal", async () => {
    const agent = createMockAgent(["Response 1", "Response 2", "Response 3"]);
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(["Follow-up question 1", "Follow-up question 2", "</finished>"]),
    });
    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Start", conversationPlan: "Ask three questions", maxTurns: 10 },
      agent
    )) {
      turns.push(turn);
    }
    expect(turns).toHaveLength(3);
    expect(turns[0].userMessage).toBe("Start");
    expect(turns[1].userMessage).toBe("Follow-up question 1");
    expect(turns[2].userMessage).toBe("Follow-up question 2");
  });

  it("stops at maxTurns", async () => {
    const agent = createMockAgent(Array(20).fill("Response"));
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(Array(20).fill("Next question")),
    });
    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Start", conversationPlan: "Keep going", maxTurns: 3 },
      agent
    )) {
      turns.push(turn);
    }
    expect(turns).toHaveLength(3);
  });

  it("uses default maxTurns of 10", async () => {
    const agent = createMockAgent(Array(20).fill("Response"));
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(Array(20).fill("Next")),
    });
    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Start", conversationPlan: "Keep going" },
      agent
    )) {
      turns.push(turn);
    }
    expect(turns).toHaveLength(10);
  });

  it("uses custom stopSignal", async () => {
    const agent = createMockAgent(["R1", "R2"]);
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(["Question", "DONE"]),
    });
    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Start", conversationPlan: "Plan", stopSignal: "DONE" },
      agent
    )) {
      turns.push(turn);
    }
    expect(turns).toHaveLength(2);
  });

  it("records tool calls from agent", async () => {
    const agent: AgentFunction = async () => ({
      text: "Found flights",
      toolCalls: [{ name: "search_flights", args: { from: "SFO" } }],
    });
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(["</finished>"]),
    });
    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Find flights", conversationPlan: "Search", maxTurns: 1 },
      agent
    )) {
      turns.push(turn);
    }
    expect(turns[0].toolCalls).toHaveLength(1);
    expect(turns[0].toolCalls[0].name).toBe("search_flights");
  });

  it("tracks token usage from LLMResponse objects", async () => {
    const agent = createMockAgent(["Response"]);
    const simulatorLLM: LLMFunction = async () => ({ text: "</finished>", tokenUsage: 50 });
    const simulator = new UserSimulator({ simulatorLLM });
    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Start", conversationPlan: "Plan", maxTurns: 2 },
      agent
    )) {
      turns.push(turn);
    }
    expect(simulator.totalSimulatorTokens).toBe(50);
  });

  it("measures turn duration", async () => {
    const agent: AgentFunction = async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { text: "Response", toolCalls: [] };
    };
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(["</finished>"]),
    });
    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Start", conversationPlan: "Plan", maxTurns: 1 },
      agent
    )) {
      turns.push(turn);
    }
    expect(turns[0].durationMs).toBeGreaterThanOrEqual(40);
  });

  it("detects stop signal embedded in longer message", async () => {
    const agent = createMockAgent(["R1"]);
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(["Some text </finished> more text"]),
    });
    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Start", conversationPlan: "Plan", maxTurns: 5 },
      agent
    )) {
      turns.push(turn);
    }
    expect(turns).toHaveLength(1);
  });
});
