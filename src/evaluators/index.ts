import type { EvalResult, Evaluator, SimulationResult, ConversationScenario } from "../types.js";

export { createTrajectoryEvaluator } from "./trajectory.js";
export { createPlanCompletionEvaluator } from "./plan-completion.js";
export { createResponseQualityEvaluator } from "./response-quality.js";
export { createPersonaAdherenceEvaluator } from "./persona-adherence.js";
export { createKnowledgeRetentionEvaluator } from "./knowledge-retention.js";
export { createConversationRelevancyEvaluator } from "./conversation-relevancy.js";

interface DefineEvaluatorConfig {
  name: string;
  evaluate(
    result: SimulationResult,
    scenario: ConversationScenario
  ): Promise<Omit<EvalResult, "evaluator">>;
}

export function defineEvaluator(config: DefineEvaluatorConfig): Evaluator {
  return {
    name: config.name,
    async evaluate(
      result: SimulationResult,
      scenario: ConversationScenario
    ): Promise<EvalResult> {
      const evalResult = await config.evaluate(result, scenario);
      return { evaluator: config.name, ...evalResult };
    },
  };
}
