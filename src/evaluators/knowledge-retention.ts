import { z } from "zod";
import type {
  Evaluator,
  EvalResult,
  SimulationResult,
  ConversationScenario,
  LLMFunction,
  TurnEvalResult,
} from "../types.js";
import { extractLLMText } from "../types.js";
import { parseJudgeResponse } from "../prompts/judge-common.js";
import { buildKnowledgeRetentionPrompt } from "../prompts/knowledge-retention-judge.js";

const FactsSchema = z.object({
  facts: z.array(z.string()),
});

export interface KnowledgeRetentionConfig {
  judgeLLM: LLMFunction;
  threshold?: number;
}

function extractFacts(raw: string): string[] {
  // Try full parse first
  try {
    const parsed = JSON.parse(raw);
    const result = FactsSchema.safeParse(parsed);
    if (result.success) return result.data.facts;
  } catch {
    // Try extraction
  }

  // Find JSON object by matching braces
  const startIdx = raw.indexOf("{");
  if (startIdx === -1) return [];

  let depth = 0;
  for (let i = startIdx; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(raw.slice(startIdx, i + 1));
          const result = FactsSchema.safeParse(parsed);
          return result.success ? result.data.facts : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

export function createKnowledgeRetentionEvaluator(
  config: KnowledgeRetentionConfig
): Evaluator {
  const threshold = config.threshold ?? 0.7;

  return {
    name: "knowledge-retention",
    async evaluate(
      result: SimulationResult,
      _scenario: ConversationScenario
    ): Promise<EvalResult> {
      if (result.turns.length <= 1) {
        return {
          evaluator: "knowledge-retention",
          score: 1.0,
          pass: true,
          reason: "single turn - no retention to evaluate",
        };
      }

      // Step 1: Extract facts from all user messages
      const allUserMessages = result.turns
        .map((t) => t.userMessage)
        .join("\n");
      const factExtractionPrompt = `Extract all factual statements the user made in this conversation. Return a JSON object: {"facts": ["fact1", "fact2", ...]}\n\n${allUserMessages}`;

      const factResponse = await config.judgeLLM([
        { role: "user", content: factExtractionPrompt },
      ]);
      const factText = extractLLMText(factResponse);
      const facts = extractFacts(factText);

      if (facts.length === 0) {
        return {
          evaluator: "knowledge-retention",
          score: 1.0,
          pass: true,
          reason: "No facts found to evaluate retention against",
        };
      }

      // Step 2: For turns 1..N, check retention
      const perTurn: TurnEvalResult[] = [];
      for (let i = 1; i < result.turns.length; i++) {
        const turn = result.turns[i];
        const turnContent = `User: ${turn.userMessage}\nAgent: ${turn.agentResponse}`;
        const prompt = buildKnowledgeRetentionPrompt(facts, turnContent);

        const response = await config.judgeLLM([
          { role: "user", content: prompt },
        ]);
        const text = extractLLMText(response);
        const parsed = parseJudgeResponse(text);

        perTurn.push({
          turnIndex: turn.index,
          score: parsed.score,
          reason: parsed.reason,
        });
      }

      const avgScore =
        perTurn.length === 0
          ? 1.0
          : Math.round(
              (perTurn.reduce((sum, t) => sum + t.score, 0) / perTurn.length) *
                100
            ) / 100;

      return {
        evaluator: "knowledge-retention",
        score: avgScore,
        pass: avgScore >= threshold,
        reason: `Average knowledge retention: ${avgScore}`,
        perTurn,
      };
    },
  };
}
