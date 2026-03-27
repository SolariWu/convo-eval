import type {
  AgentFunction,
  ConversationScenario,
  LLMMessage,
  Turn,
  UserSimulatorConfig,
} from "./types.js";
import { extractLLMText, extractTokenUsage } from "./types.js";
import { buildSimulatorSystemPrompt } from "./prompts/simulator-system.js";

const DEFAULT_MAX_TURNS = 10;
const DEFAULT_STOP_SIGNAL = "</finished>";

export class UserSimulator {
  private config: UserSimulatorConfig;
  public totalSimulatorTokens = 0;

  constructor(config: UserSimulatorConfig) {
    this.config = config;
  }

  async *run(
    scenario: ConversationScenario,
    agentFn: AgentFunction
  ): AsyncGenerator<Turn> {
    const maxTurns = scenario.maxTurns ?? DEFAULT_MAX_TURNS;
    const stopSignal = scenario.stopSignal ?? DEFAULT_STOP_SIGNAL;
    const turns: Turn[] = [];
    this.totalSimulatorTokens = 0;

    const systemPrompt =
      this.config.systemPromptOverride ??
      buildSimulatorSystemPrompt({
        conversationPlan: scenario.conversationPlan,
        stopSignal,
        personaDescription: scenario.userPersona?.description,
        personaBehaviors: scenario.userPersona?.behaviors
          .map((b) => `- ${b.name}: ${b.description}`)
          .join("\n"),
      });

    // Turn 0: starting prompt
    const startTime0 = Date.now();
    const agentResponse0 = await agentFn(scenario.startingPrompt, []);
    const turn0: Turn = {
      index: 0,
      userMessage: scenario.startingPrompt,
      agentResponse: agentResponse0.text,
      toolCalls: agentResponse0.toolCalls,
      durationMs: Date.now() - startTime0,
    };
    turns.push(turn0);
    yield turn0;

    // Turns 1..N
    for (let i = 1; i < maxTurns; i++) {
      const messages: LLMMessage[] = [
        { role: "system", content: systemPrompt },
      ];
      for (const t of turns) {
        messages.push({ role: "assistant", content: t.userMessage });
        messages.push({ role: "user", content: t.agentResponse });
      }

      const simulatorResponse = await this.config.simulatorLLM(messages);
      const simulatorText = extractLLMText(simulatorResponse);
      this.totalSimulatorTokens += extractTokenUsage(simulatorResponse);

      if (simulatorText.includes(stopSignal)) {
        break;
      }

      const startTime = Date.now();
      const agentResponse = await agentFn(simulatorText, turns);
      const turn: Turn = {
        index: i,
        userMessage: simulatorText,
        agentResponse: agentResponse.text,
        toolCalls: agentResponse.toolCalls,
        durationMs: Date.now() - startTime,
      };
      turns.push(turn);
      yield turn;
    }
  }
}
