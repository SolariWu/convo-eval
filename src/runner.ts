import { UserSimulator } from "./simulator.js";
import type { SimulateConfig, SimulationResult, Turn } from "./types.js";

export async function simulate(config: SimulateConfig): Promise<SimulationResult> {
  const simulator = new UserSimulator({
    simulatorLLM: config.simulatorLLM,
    systemPromptOverride: config.systemPromptOverride,
  });

  const maxTurns = config.scenario.maxTurns ?? 10;
  const turns: Turn[] = [];

  try {
    for await (const turn of simulator.run(config.scenario, config.agentFn)) {
      turns.push(turn);
    }
  } catch (error) {
    return {
      turns,
      planCompleted: false,
      terminationReason: "error",
      tokenUsage: { simulator: simulator.totalSimulatorTokens, agent: 0 },
    };
  }

  const planCompleted = turns.length < maxTurns;

  return {
    turns,
    planCompleted,
    terminationReason: planCompleted ? "stop_signal" : "max_turns",
    tokenUsage: { simulator: simulator.totalSimulatorTokens, agent: 0 },
  };
}
