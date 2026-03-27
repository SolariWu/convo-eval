import type {
  Evaluator,
  EvalResult,
  SimulationResult,
  ConversationScenario,
  LLMFunction,
} from "../types.js";
import { extractLLMText } from "../types.js";
import { formatTranscript, parseJudgeResponse } from "../prompts/judge-common.js";
import { buildPlanCompletionPrompt } from "../prompts/plan-completion-judge.js";

export interface PlanCompletionConfig {
  judgeLLM: LLMFunction;
  threshold?: number;
}

export function createPlanCompletionEvaluator(
  config: PlanCompletionConfig
): Evaluator {
  const threshold = config.threshold ?? 0.7;

  return {
    name: "plan-completion",
    async evaluate(
      result: SimulationResult,
      scenario: ConversationScenario
    ): Promise<EvalResult> {
      const transcript = formatTranscript(result.turns);
      const prompt = buildPlanCompletionPrompt(
        scenario.conversationPlan,
        transcript
      );

      const response = await config.judgeLLM([
        { role: "user", content: prompt },
      ]);
      const text = extractLLMText(response);
      const parsed = parseJudgeResponse(text);

      return {
        evaluator: "plan-completion",
        score: parsed.score,
        pass: parsed.score >= threshold,
        reason: parsed.reason,
      };
    },
  };
}
