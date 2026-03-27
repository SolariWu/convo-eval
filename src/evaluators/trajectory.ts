import type {
  Evaluator,
  EvalResult,
  SimulationResult,
  ConversationScenario,
  ToolCall,
} from "../types.js";

export interface TrajectoryConfig {
  expected: Array<{ name: string; args: Record<string, unknown> }>;
  matchMode: "exact" | "in_order" | "any_order";
  threshold?: number;
}

/** Deep partial equality: every key in `expected` must exist in `actual` with the same value. */
function argsMatch(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>
): boolean {
  for (const key of Object.keys(expected)) {
    if (!(key in actual)) return false;
    const ev = expected[key];
    const av = actual[key];
    if (
      typeof ev === "object" &&
      ev !== null &&
      typeof av === "object" &&
      av !== null
    ) {
      if (
        !argsMatch(
          ev as Record<string, unknown>,
          av as Record<string, unknown>
        )
      ) {
        return false;
      }
    } else if (ev !== av) {
      return false;
    }
  }
  return true;
}

function toolMatches(
  expected: { name: string; args: Record<string, unknown> },
  actual: ToolCall
): boolean {
  return expected.name === actual.name && argsMatch(expected.args, actual.args);
}

function scoreExact(
  expected: TrajectoryConfig["expected"],
  actual: ToolCall[]
): { matched: number; total: number; reason: string } {
  const total = expected.length;
  if (actual.length !== expected.length) {
    return {
      matched: 0,
      total,
      reason: `Expected ${expected.length} tool calls but got ${actual.length}`,
    };
  }
  let matched = 0;
  for (let i = 0; i < expected.length; i++) {
    if (toolMatches(expected[i], actual[i])) {
      matched++;
    }
  }
  const reason =
    matched === total
      ? "All tool calls matched exactly"
      : `${matched}/${total} tool calls matched in exact order`;
  return { matched, total, reason };
}

function scoreInOrder(
  expected: TrajectoryConfig["expected"],
  actual: ToolCall[]
): { matched: number; total: number; reason: string } {
  const total = expected.length;
  let ei = 0;
  for (let ai = 0; ai < actual.length && ei < expected.length; ai++) {
    if (toolMatches(expected[ei], actual[ai])) {
      ei++;
    }
  }
  const matched = ei;
  const reason =
    matched === total
      ? "All expected tool calls found in order"
      : `${matched}/${total} expected tool calls found in order`;
  return { matched, total, reason };
}

function scoreAnyOrder(
  expected: TrajectoryConfig["expected"],
  actual: ToolCall[]
): { matched: number; total: number; reason: string } {
  const total = expected.length;
  const used = new Set<number>();
  let matched = 0;
  for (const exp of expected) {
    for (let ai = 0; ai < actual.length; ai++) {
      if (!used.has(ai) && toolMatches(exp, actual[ai])) {
        used.add(ai);
        matched++;
        break;
      }
    }
  }
  const reason =
    matched === total
      ? "All expected tool calls found (any order)"
      : `${matched}/${total} expected tool calls found`;
  return { matched, total, reason };
}

export function createTrajectoryEvaluator(
  config: TrajectoryConfig
): Evaluator {
  const threshold = config.threshold ?? 1.0;

  return {
    name: "tool-trajectory",
    async evaluate(
      result: SimulationResult,
      _scenario: ConversationScenario
    ): Promise<EvalResult> {
      const actual = result.turns.flatMap((t) => t.toolCalls);

      let scored: { matched: number; total: number; reason: string };
      switch (config.matchMode) {
        case "exact":
          scored = scoreExact(config.expected, actual);
          break;
        case "in_order":
          scored = scoreInOrder(config.expected, actual);
          break;
        case "any_order":
          scored = scoreAnyOrder(config.expected, actual);
          break;
      }

      const score =
        scored.total === 0 ? 1.0 : scored.matched / scored.total;

      return {
        evaluator: "tool-trajectory",
        score,
        pass: score >= threshold,
        reason: scored.reason,
      };
    },
  };
}
