import { expect } from "vitest";
import { simulate } from "../runner.js";
import { evaluate } from "../evaluate.js";
import type {
  AgentFunction,
  ConversationScenario,
  Evaluator,
  LLMFunction,
} from "../types.js";

interface MatcherOptions {
  simulatorLLM: LLMFunction;
  evaluators: Evaluator[];
  threshold: number;
}

export function installMatchers(): void {
  expect.extend({
    async toPassConversationScenario(
      received: AgentFunction,
      scenario: ConversationScenario,
      options: MatcherOptions
    ) {
      const result = await simulate({
        scenario,
        agentFn: received,
        simulatorLLM: options.simulatorLLM,
      });

      const summary = await evaluate(result, scenario, {
        evaluators: options.evaluators,
      });

      const pass = summary.overall === "PASS";

      const failedEvals = summary.evaluators.filter((e) => !e.pass);
      const details = summary.evaluators
        .map(
          (e) =>
            `  ${e.pass ? "PASS" : "FAIL"} ${e.evaluator}: ${e.score.toFixed(2)} — ${e.reason}`
        )
        .join("\n");

      return {
        pass,
        message: () =>
          pass
            ? `Expected agent to fail conversation scenario, but all evaluators passed:\n${details}`
            : `Agent failed conversation scenario:\n${details}\n\nFailed evaluators: ${failedEvals.map((e) => e.evaluator).join(", ")}`,
      };
    },
  });
}

declare module "vitest" {
  interface Assertion<T> {
    toPassConversationScenario(
      scenario: ConversationScenario,
      options: MatcherOptions
    ): Promise<void>;
  }
  interface AsymmetricMatchersContaining {
    toPassConversationScenario(
      scenario: ConversationScenario,
      options: MatcherOptions
    ): void;
  }
}
