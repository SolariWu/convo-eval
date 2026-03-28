import {
  simulate,
  evaluate,
  createPlanCompletionEvaluator,
  createResponseQualityEvaluator,
  EXPERT,
} from "../../src/index.js";
import type { LLMFunction, LLMMessage } from "../../src/types.js";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!OPENROUTER_KEY && !ANTHROPIC_KEY) {
  console.error("Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY");
  process.exit(1);
}

async function openRouterChat(
  messages: Array<{ role: string; content: string }>,
  model: string
) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: 1024 }),
  });
  const data = (await response.json()) as any;
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    tokenUsage: data.usage?.completion_tokens ?? 0,
  };
}

const MODEL = OPENROUTER_KEY ? "anthropic/claude-haiku-4.5" : "claude-haiku-4-5-20251001";

const llmFn: LLMFunction = async (messages: LLMMessage[]) => {
  if (OPENROUTER_KEY) {
    return openRouterChat(
      messages.map((m) => ({ role: m.role, content: m.content })),
      MODEL
    );
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const systemMsg = messages.find((m) => m.role === "system");
  const chat = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemMsg?.content,
    messages: chat,
  });
  const text = resp.content[0].type === "text" ? resp.content[0].text : "";
  return { text, tokenUsage: resp.usage.output_tokens };
};

const agentFn = async (message: string, history: any[]) => {
  const msgs: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content:
        "You are a helpful travel assistant. Help users book flights and answer travel questions. Be concise.",
    },
  ];
  for (const turn of history) {
    msgs.push({ role: "user", content: turn.userMessage });
    msgs.push({ role: "assistant", content: turn.agentResponse });
  }
  msgs.push({ role: "user", content: message });

  if (OPENROUTER_KEY) {
    const { text } = await openRouterChat(msgs, MODEL);
    return { text, toolCalls: [] };
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: msgs[0].content,
    messages: msgs.slice(1).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });
  const text = resp.content[0].type === "text" ? resp.content[0].text : "";
  return { text, toolCalls: [] };
};

async function main() {
  const provider = OPENROUTER_KEY ? "openrouter" : "anthropic";
  console.log(`Provider: ${provider} | Model: ${MODEL}\n`);

  const result = await simulate({
    scenario: {
      startingPrompt:
        "I need to fly from San Francisco to Los Angeles next Tuesday morning. What are my options?",
      conversationPlan:
        "Ask about flights from SFO to LAX for next Tuesday morning. Prefer flights under $200. If the agent suggests options, pick the cheapest one.",
      userPersona: EXPERT,
      maxTurns: 5,
    },
    agentFn,
    simulatorLLM: llmFn,
  });

  console.log("=".repeat(60));
  console.log("  FULL CONVERSATION TRANSCRIPT");
  console.log("=".repeat(60) + "\n");

  for (const turn of result.turns) {
    console.log(`-- Turn ${turn.index} (${turn.durationMs}ms) ${"─".repeat(40)}`);
    console.log(`\nUser:\n${turn.userMessage}\n`);
    console.log(`Agent:\n${turn.agentResponse}\n`);
    if (turn.toolCalls.length > 0) {
      console.log(`Tool calls: ${turn.toolCalls.map((t) => t.name).join(", ")}\n`);
    }
  }

  console.log("=".repeat(60));
  console.log(
    `  Turns: ${result.turns.length} | Plan completed: ${result.planCompleted} | Reason: ${result.terminationReason}`
  );
  console.log(`  Simulator tokens: ${result.tokenUsage.simulator}`);
  console.log("=".repeat(60) + "\n");

  const summary = await evaluate(
    result,
    {
      startingPrompt: result.turns[0].userMessage,
      conversationPlan: "Ask about flights from SFO to LAX",
      userPersona: EXPERT,
    },
    {
      evaluators: [
        createPlanCompletionEvaluator({ judgeLLM: llmFn, threshold: 0.3 }),
        createResponseQualityEvaluator({
          judgeLLM: llmFn,
          rubric:
            "The agent should be helpful, relevant, and provide travel-related information.",
          threshold: 0.3,
        }),
      ],
    }
  );

  console.log("=".repeat(60));
  console.log("  EVALUATION RESULTS");
  console.log("=".repeat(60) + "\n");
  console.log(`Overall: ${summary.overall}\n`);
  for (const e of summary.evaluators) {
    console.log(`${e.pass ? "PASS" : "FAIL"} ${e.evaluator}: ${e.score.toFixed(2)}`);
    console.log(`     ${e.reason}\n`);
  }

  // Export full results to JSON
  const outputPath = process.argv[2] ?? "test/integration/results.json";
  const { writeFileSync } = await import("node:fs");
  const fullOutput = {
    provider,
    model: MODEL,
    scenario: {
      startingPrompt: result.turns[0]?.userMessage,
      conversationPlan:
        "Ask about flights from SFO to LAX for next Tuesday morning. Prefer flights under $200. If the agent suggests options, pick the cheapest one.",
      userPersona: EXPERT,
      maxTurns: 5,
    },
    simulation: result,
    evaluation: summary,
  };
  writeFileSync(outputPath, JSON.stringify(fullOutput, null, 2));
  console.log(`\nFull results exported to: ${outputPath}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
