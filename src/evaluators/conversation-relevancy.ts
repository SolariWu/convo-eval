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
import { buildConversationRelevancyPrompt } from "../prompts/conversation-relevancy-judge.js";

export interface ConversationRelevancyConfig {
  judgeLLM: LLMFunction;
  threshold?: number;
  windowSize?: number;
}

export function createConversationRelevancyEvaluator(
  config: ConversationRelevancyConfig
): Evaluator {
  const threshold = config.threshold ?? 0.7;
  const windowSize = config.windowSize ?? 3;

  return {
    name: "conversation-relevancy",
    async evaluate(
      result: SimulationResult,
      _scenario: ConversationScenario
    ): Promise<EvalResult> {
      const perTurn: TurnEvalResult[] = [];

      for (let i = 0; i < result.turns.length; i++) {
        const turn = result.turns[i];

        let recentContext: string;
        if (i === 0) {
          recentContext = `User: ${turn.userMessage}`;
        } else {
          const start = Math.max(0, i - windowSize);
          const contextTurns = result.turns.slice(start, i);
          recentContext = contextTurns
            .map((t) => `User: ${t.userMessage}\nAgent: ${t.agentResponse}`)
            .join("\n");
        }

        const currentResponse = `Agent: ${turn.agentResponse}`;
        const prompt = buildConversationRelevancyPrompt(
          recentContext,
          currentResponse
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
        evaluator: "conversation-relevancy",
        score: avgScore,
        pass: avgScore >= threshold,
        reason: `Average conversation relevancy: ${avgScore}`,
        perTurn,
      };
    },
  };
}
