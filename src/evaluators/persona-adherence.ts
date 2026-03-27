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
import { buildPersonaAdherencePrompt } from "../prompts/persona-adherence-judge.js";

export interface PersonaAdherenceConfig {
  judgeLLM: LLMFunction;
  threshold?: number;
}

export function createPersonaAdherenceEvaluator(
  config: PersonaAdherenceConfig
): Evaluator {
  const threshold = config.threshold ?? 0.8;

  return {
    name: "persona-adherence",
    async evaluate(
      result: SimulationResult,
      scenario: ConversationScenario
    ): Promise<EvalResult> {
      if (!scenario.userPersona) {
        return {
          evaluator: "persona-adherence",
          score: 1.0,
          pass: true,
          reason: "No persona defined",
        };
      }

      const violationRubrics = scenario.userPersona.behaviors.flatMap(
        (b) => b.violationRubrics
      );

      const perTurn: TurnEvalResult[] = [];

      for (const turn of result.turns) {
        const prompt = buildPersonaAdherencePrompt(
          violationRubrics,
          turn.userMessage
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
        evaluator: "persona-adherence",
        score: avgScore,
        pass: avgScore >= threshold,
        reason: `Average persona adherence: ${avgScore}`,
        perTurn,
      };
    },
  };
}
