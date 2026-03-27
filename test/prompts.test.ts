import { describe, it, expect } from "vitest";
import { buildSimulatorSystemPrompt } from "../src/prompts/simulator-system.js";
import { parseJudgeResponse } from "../src/prompts/judge-common.js";
import { buildPlanCompletionPrompt } from "../src/prompts/plan-completion-judge.js";
import { buildResponseQualityPrompt } from "../src/prompts/response-quality-judge.js";
import { buildPersonaAdherencePrompt } from "../src/prompts/persona-adherence-judge.js";
import { buildKnowledgeRetentionPrompt } from "../src/prompts/knowledge-retention-judge.js";
import { buildConversationRelevancyPrompt } from "../src/prompts/conversation-relevancy-judge.js";

describe("buildSimulatorSystemPrompt", () => {
  it("includes the conversation plan", () => {
    const prompt = buildSimulatorSystemPrompt({
      conversationPlan: "Book a flight to LAX",
      stopSignal: "</finished>",
    });
    expect(prompt).toContain("Book a flight to LAX");
    expect(prompt).toContain("</finished>");
  });
  it("includes persona when provided", () => {
    const prompt = buildSimulatorSystemPrompt({
      conversationPlan: "Plan",
      stopSignal: "</finished>",
      personaDescription: "A frustrated customer",
      personaBehaviors: "- Terse: keeps messages short",
    });
    expect(prompt).toContain("A frustrated customer");
    expect(prompt).toContain("Terse");
  });
  it("uses default persona text when none provided", () => {
    const prompt = buildSimulatorSystemPrompt({
      conversationPlan: "Plan",
      stopSignal: "</finished>",
    });
    expect(prompt).toContain("typical user");
  });
});

describe("parseJudgeResponse", () => {
  it("parses valid JSON with score and reason", () => {
    const result = parseJudgeResponse('{"score": 0.8, "reason": "Good job"}');
    expect(result.score).toBe(0.8);
    expect(result.reason).toBe("Good job");
  });
  it("extracts JSON from surrounding text", () => {
    const result = parseJudgeResponse('Here is my evaluation:\n{"score": 0.5, "reason": "Partial"}\nDone.');
    expect(result.score).toBe(0.5);
  });
  it("returns score 0 for unparseable response", () => {
    const result = parseJudgeResponse("This is not JSON at all");
    expect(result.score).toBe(0);
    expect(result.reason).toContain("parse error");
  });
  it("clamps score to 0-1 range", () => {
    const result = parseJudgeResponse('{"score": 1.5, "reason": "Over"}');
    expect(result.score).toBe(1);
  });
});

describe("judge prompts", () => {
  const transcript = "User: Hi\nAgent: Hello, how can I help?";
  it("buildPlanCompletionPrompt includes plan and transcript", () => {
    const prompt = buildPlanCompletionPrompt("Book a flight", transcript);
    expect(prompt).toContain("Book a flight");
    expect(prompt).toContain(transcript);
  });
  it("buildResponseQualityPrompt includes rubric and turn", () => {
    const prompt = buildResponseQualityPrompt("Be helpful", "User: Hi", "Hello!");
    expect(prompt).toContain("Be helpful");
    expect(prompt).toContain("Hello!");
  });
  it("buildPersonaAdherencePrompt includes rubrics and user message", () => {
    const prompt = buildPersonaAdherencePrompt(["Message exceeds 50 words"], "I need help with something");
    expect(prompt).toContain("Message exceeds 50 words");
    expect(prompt).toContain("I need help with something");
  });
  it("buildKnowledgeRetentionPrompt includes facts and turn", () => {
    const prompt = buildKnowledgeRetentionPrompt(
      ["User's name is Alice", "Order number is 1234"],
      "User: What's my order status?\nAgent: Could you tell me your name?"
    );
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("Could you tell me your name");
  });
  it("buildConversationRelevancyPrompt includes context window", () => {
    const prompt = buildConversationRelevancyPrompt(
      "User: Book a flight\nAgent: Sure, where to?",
      "Agent: What color is your car?"
    );
    expect(prompt).toContain("Book a flight");
    expect(prompt).toContain("What color is your car");
  });
});
