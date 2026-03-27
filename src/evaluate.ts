import type {
  ConversationScenario,
  EvaluateConfig,
  EvaluationSummary,
  SimulationResult,
} from "./types.js";

export async function evaluate(
  result: SimulationResult,
  scenario: ConversationScenario,
  config: EvaluateConfig
): Promise<EvaluationSummary> {
  const evalResults = await Promise.all(
    config.evaluators.map((ev) => ev.evaluate(result, scenario))
  );
  const overall = evalResults.every((r) => r.pass) ? "PASS" : "FAIL";
  return { overall, evaluators: evalResults };
}
