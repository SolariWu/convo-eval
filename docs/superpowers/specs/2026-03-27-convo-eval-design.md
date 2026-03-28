# convo-eval — Implementation Design

> Multi-turn agent testing with LLM-simulated users for TypeScript.

## Scope

Full implementation of specs/spec.md sections 1-9: simulation engine, all 6 evaluators, 3 built-in personas, Vitest + Jest matchers, JSON-only CLI. npm-installable package.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package manager | npm | Universal compatibility |
| Node.js target | 18+ | Current LTS baseline |
| LLMFunction return type | `string \| { text, tokenUsage? }` | Backwards-compatible token tracking |
| CLI scenario format | JSON only | Avoids `js-yaml` runtime dependency |
| Runtime dependencies | `zod` only | Keep core lean |
| Bundler | tsup (CJS + ESM) | Dual output for broad ecosystem support |
| Integration test LLM | Claude Haiku via `@anthropic-ai/sdk` | Cost-efficient, dev dependency only |
| License | MIT | Already established |

## Architecture

Five layers, each depending only on the layer below:

```
CLI (cli/)  →  Matchers (matchers/)
       ↓              ↓
     Runner (runner.ts + evaluate.ts)
       ↓
     Engine (simulator.ts)
       ↓
     Core (types.ts + personas/ + prompts/)
```

## Core Types

All types from spec sections 3-5, with one extension:

```typescript
type LLMResponse = string | { text: string; tokenUsage?: number };
type LLMFunction = (messages: LLMMessage[]) => Promise<LLMResponse>;

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
```

`AgentFunction`, `ConversationScenario`, `UserPersona`, `PersonaBehavior`, `Turn`, `ToolCall`, `AgentResponse`, `SimulationResult`, `Evaluator`, `EvalResult`, `TurnEvalResult` — all per spec.

Zod schemas for `ConversationScenario` and evaluator config, used by CLI loader and for runtime validation of scenario files.

## Simulation Engine

`UserSimulator` class with async generator `run()`:

```typescript
class UserSimulator {
  constructor(config: UserSimulatorConfig)
  async *run(scenario: ConversationScenario, agentFn: AgentFunction): AsyncGenerator<Turn>
}
```

Loop:
1. Turn 0: send `startingPrompt` to agent, yield turn.
2. Turn 1..N: build simulator prompt (plan + persona + history), call `simulatorLLM`, check for stop signal. If stop signal found, terminate. Otherwise send simulator output to agent, yield turn.
3. Terminate on: stop signal, maxTurns reached, or error thrown.

Default simulator system prompt uses template variables: `{conversationPlan}`, `{personaDescription}`, `{personaBehaviors}`, `{stopSignal}`. Overridable via `systemPromptOverride`.

## Runner & Evaluate

`simulate(config)` — wraps the async generator, collects turns into `SimulationResult`. Aggregates token usage from LLMResponse objects.

`evaluate(result, scenario, config)` — runs all evaluators in parallel via `Promise.all`, returns structured summary with per-evaluator results and overall pass/fail.

## Evaluators

### Deterministic

**Trajectory** (`trajectory.ts`)
- Match modes: `exact`, `in_order`, `any_order`
- Args matching: deep partial equality (expected is subset of actual)
- Score = matched / total expected

### LLM-as-Judge

All follow the same pattern: structured prompt → expect JSON `{ score, reason }` → parse with Zod → fallback to `{ score: 0, reason: "parse error: ..." }`.

**Plan completion** (`plan-completion.ts`)
- Sends full transcript + conversation plan to judge
- Asks for 0.0 / 0.5 / 1.0 score

**Response quality** (`response-quality.ts`)
- Per-turn scoring against user-provided rubric
- Final score = average across turns

**Persona adherence** (`persona-adherence.ts`)
- Per-turn check of simulator messages against `violationRubrics`
- Evaluates simulation quality, not agent quality

**Knowledge retention** (`knowledge-retention.ts`)
- Extracts user-stated facts from early turns
- Checks if agent contradicts or forgets them later

**Conversation relevancy** (`conversation-relevancy.ts`)
- Sliding window (default 3 turns)
- Per-turn relevancy check against recent context

### Custom Evaluators

`defineEvaluator({ name, evaluate })` convenience helper. Returns an `Evaluator`.

## Personas

Three built-in personas per spec section 3.3:

| Persona | Key behaviors |
|---------|---------------|
| `EXPERT` | Detail-oriented, proactively provides all relevant details |
| `NOVICE` | Goal-oriented, waits to be asked, gives minimal info |
| `EVALUATOR` | Professional tone, focused, asks targeted questions |

Each exports a `UserPersona` object with `name`, `description`, and `behaviors` (with `violationRubrics`).

## Matchers

### Vitest (`convo-eval/vitest`)

`installMatchers()` adds `toPassConversationScenario` to Vitest's `expect`:

```typescript
await expect(myAgentFn).toPassConversationScenario(scenario, {
  simulatorLLM,
  evaluators: [...],
  threshold: 0.8,
});
```

Runs simulate + evaluate under the hood. Fails with detailed evaluator breakdown.

### Jest (`convo-eval/jest`)

Same API, adapted for Jest's `expect.extend`.

## CLI

Uses `node:util` `parseArgs`. JSON scenario files only.

```bash
npx convo-eval run scenarios.json --agent ./adapter.ts --simulator ./llm.ts --output results.json
```

- `--agent` — file default-exporting `AgentFunction`
- `--simulator` — file default-exporting `LLMFunction`
- `--output` — optional, writes results JSON
- TS files loaded via dynamic `tsx` import

Scenario JSON validated with Zod schema.

## Package Exports

```jsonc
{
  "exports": {
    ".": "./dist/index.js",         // simulate, evaluate, types, personas, evaluators
    "./vitest": "./dist/matchers/vitest.js",
    "./jest": "./dist/matchers/jest.js"
  },
  "bin": {
    "convo-eval": "./dist/cli/index.js"
  }
}
```

## Testing Strategy

### Unit Tests (mock LLM)

- Simulator: turn counting, stop signal detection, max turns, token aggregation
- Each evaluator: scoring logic with canned transcripts
- Matchers: pass/fail behavior
- CLI loader: valid/invalid JSON parsing

### Integration Test (real Claude API)

- `@anthropic-ai/sdk` as dev dependency
- Claude Haiku as both simulator and agent LLM
- Full scenario: simulate → evaluate with plan-completion + trajectory
- Gated behind `ANTHROPIC_API_KEY` env var (skipped if absent)
- 60s+ Vitest timeout

## File Structure

```
src/
  index.ts                    # Public API re-exports
  types.ts                    # All type definitions + Zod schemas
  simulator.ts                # UserSimulator class
  runner.ts                   # simulate() orchestrator
  evaluate.ts                 # evaluate() orchestrator
  evaluators/
    index.ts                  # Re-exports + defineEvaluator()
    plan-completion.ts
    trajectory.ts
    response-quality.ts
    persona-adherence.ts
    knowledge-retention.ts
    conversation-relevancy.ts
  personas/
    index.ts
    expert.ts
    novice.ts
    evaluator.ts
  prompts/
    simulator-system.ts
    judge-common.ts               # Shared JSON-output parsing + Zod schema for judge responses
    plan-completion-judge.ts
    response-quality-judge.ts
    persona-adherence-judge.ts
    knowledge-retention-judge.ts
    conversation-relevancy-judge.ts
  matchers/
    vitest.ts
    jest.ts
  cli/
    index.ts
    loader.ts
test/
  simulator.test.ts
  evaluators/
    plan-completion.test.ts
    trajectory.test.ts
    response-quality.test.ts
    persona-adherence.test.ts
    knowledge-retention.test.ts
    conversation-relevancy.test.ts
  matchers/
    vitest.test.ts
  cli/
    loader.test.ts
  integration/
    full-scenario.test.ts
```

## Dependencies

**Runtime:** `zod`

**Dev:** `typescript`, `tsup`, `vitest`, `@anthropic-ai/sdk`, `@types/node`

**Peer (optional):** `vitest` (for matchers), `jest` + `@jest/expect` (for matchers)
