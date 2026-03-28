import { describe, it, expect } from "vitest";
import {
  ConversationScenarioSchema,
  ScenarioFileSchema,
  extractLLMText,
  extractTokenUsage,
} from "../src/types.js";

describe("extractLLMText", () => {
  it("extracts text from a string response", () => {
    expect(extractLLMText("hello")).toBe("hello");
  });
  it("extracts text from an object response", () => {
    expect(extractLLMText({ text: "hello", tokenUsage: 10 })).toBe("hello");
  });
});

describe("extractTokenUsage", () => {
  it("returns 0 for a string response", () => {
    expect(extractTokenUsage("hello")).toBe(0);
  });
  it("returns tokenUsage from an object response", () => {
    expect(extractTokenUsage({ text: "hello", tokenUsage: 42 })).toBe(42);
  });
  it("returns 0 when tokenUsage is undefined", () => {
    expect(extractTokenUsage({ text: "hello" })).toBe(0);
  });
});

describe("ConversationScenarioSchema", () => {
  it("validates a minimal scenario", () => {
    const result = ConversationScenarioSchema.safeParse({
      startingPrompt: "Hello",
      conversationPlan: "Ask about the weather",
    });
    expect(result.success).toBe(true);
  });
  it("validates a full scenario with persona", () => {
    const result = ConversationScenarioSchema.safeParse({
      startingPrompt: "Hello",
      conversationPlan: "Ask about the weather",
      maxTurns: 5,
      stopSignal: "DONE",
      userPersona: {
        name: "expert",
        description: "A detail-oriented user",
        behaviors: [{
          name: "proactive",
          description: "Provides info upfront",
          violationRubrics: ["Did not provide info"],
        }],
      },
    });
    expect(result.success).toBe(true);
  });
  it("rejects missing required fields", () => {
    const result = ConversationScenarioSchema.safeParse({ startingPrompt: "Hello" });
    expect(result.success).toBe(false);
  });
  it("rejects invalid maxTurns", () => {
    const result = ConversationScenarioSchema.safeParse({
      startingPrompt: "Hello",
      conversationPlan: "Plan",
      maxTurns: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("ScenarioFileSchema", () => {
  it("validates a scenario file with named scenarios", () => {
    const result = ScenarioFileSchema.safeParse({
      scenarios: [{ name: "test-scenario", startingPrompt: "Hi", conversationPlan: "Do something" }],
    });
    expect(result.success).toBe(true);
  });
  it("validates a scenario file with eval config", () => {
    const result = ScenarioFileSchema.safeParse({
      scenarios: [{ name: "test", startingPrompt: "Hi", conversationPlan: "Plan" }],
      evalConfig: {
        evaluators: [
          { name: "plan-completion", threshold: 0.8 },
          { name: "tool-trajectory", matchMode: "in_order", threshold: 1.0 },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});
