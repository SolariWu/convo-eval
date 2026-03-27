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
import { buildResponseQualityPrompt } from "../prompts/response-quality-judge.js";

export interface ResponseQualityConfig {
  judgeLLM: LLMFunction;
  rubric: string;
  threshold?: number;
}

export function createResponseQualityEvaluator(
  config: ResponseQualityConfig
): Evaluator {
  const threshold = config.threshold ?? 0.7;

  return {
    name: "response-quality",
    async evaluate(
      result: SimulationResult,
      _scenario: ConversationScenario
    ): Promise<EvalResult> {
      const perTurn: TurnEvalResult[] = [];

      for (const turn of result.turns) {
        const prompt = buildResponseQualityPrompt(
          config.rubric,
          turn.userMessage,
          turn.agentResponse
        );
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
        evaluator: "response-quality",
        score: avgScore,
        pass: avgScore >= threshold,
        reason: `Average response quality: ${avgScore}`,
        perTurn,
      };
    },
  };
}
