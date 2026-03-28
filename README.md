# convo-eval

Multi-turn agent testing with LLM-simulated users for TypeScript.

Most agent testing is single-turn: given input X, does output Y meet criteria Z? But agents in production operate across multi-turn conversations where failures compound — context drift, knowledge loss, infinite loops, instruction drift. `convo-eval` tests for these by simulating entire conversations, then scoring the results.

**Framework-agnostic.** Works with any agent that accepts a string and returns a response — ADK, LangChain, Vercel AI SDK, raw API calls, or anything else.

**Provider-agnostic.** The simulator LLM, evaluator LLM, and agent LLM are all injectable functions. Use OpenAI, Anthropic, Google, local models, or any custom API.

## Install

```bash
npm install convo-eval
```

## Quick Start

### Programmatic API

```typescript
import { simulate, evaluate, createPlanCompletionEvaluator, EXPERT } from "convo-eval";

// 1. Define your LLM function (any provider works)
const myLLM = async (messages) => {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  });
  return response.choices[0].message.content;
};

// 2. Wrap your agent
const myAgent = async (message, history) => {
  // Call your agent however you normally would
  const response = await myAgentFramework.chat(message);
  return { text: response.text, toolCalls: response.toolCalls ?? [] };
};

// 3. Simulate a conversation
const result = await simulate({
  scenario: {
    startingPrompt: "I need to book a flight from SFO to LAX.",
    conversationPlan:
      "Book a one-way flight for next Tuesday morning. Prefer flights under $200. Pick the cheapest option if available.",
    userPersona: EXPERT,
    maxTurns: 8,
  },
  agentFn: myAgent,
  simulatorLLM: myLLM,
});

// 4. Evaluate the result
const summary = await evaluate(result, result.scenario, {
  evaluators: [
    createPlanCompletionEvaluator({ judgeLLM: myLLM, threshold: 0.8 }),
  ],
});

console.log(summary.overall); // "PASS" or "FAIL"
```

### Vitest Matchers

```typescript
import { installMatchers } from "convo-eval/vitest";
import { NOVICE, createPlanCompletionEvaluator, createResponseQualityEvaluator } from "convo-eval";

installMatchers();

test("support agent handles return request", async () => {
  await expect(myAgentFn).toPassConversationScenario(
    {
      startingPrompt: "I need to return a defective laptop.",
      conversationPlan:
        "Express frustration, ask about return policy, provide order #1234 when asked, request a replacement.",
      userPersona: NOVICE,
      maxTurns: 8,
    },
    {
      simulatorLLM: myLLM,
      evaluators: [
        createPlanCompletionEvaluator({ judgeLLM: myLLM, threshold: 0.8 }),
        createResponseQualityEvaluator({
          judgeLLM: myLLM,
          rubric: "Agent should be empathetic, accurate, and resolve the issue.",
          threshold: 0.7,
        }),
      ],
    }
  );
});
```

Jest is also supported via `import { installMatchers } from "convo-eval/jest"`.

### CLI

```bash
npx convo-eval run scenarios.json --agent ./my-agent.js --simulator ./my-llm.js
```

Where `scenarios.json`:

```json
{
  "scenarios": [
    {
      "name": "flight-booking",
      "startingPrompt": "I need to book a flight.",
      "conversationPlan": "Book a one-way flight from SFO to LAX for next Tuesday.",
      "maxTurns": 8
    }
  ]
}
```

And `--agent` / `--simulator` point to files that default-export an `AgentFunction` and `LLMFunction` respectively.

## Core Concepts

### Scenarios

A `ConversationScenario` defines _what_ to test without scripting the exact messages:

```typescript
interface ConversationScenario {
  startingPrompt: string;    // First user message, sent as-is
  conversationPlan: string;  // Natural language goals for the simulator
  userPersona?: UserPersona; // How the simulated user behaves
  maxTurns?: number;         // Default: 10
  stopSignal?: string;       // Default: "</finished>"
}
```

The simulator LLM reads the plan and generates realistic follow-up messages until all goals are met (emitting the stop signal) or `maxTurns` is reached.

### LLMFunction

The only integration point. Any provider works:

```typescript
type LLMFunction = (messages: LLMMessage[]) => Promise<LLMResponse>;

// LLMResponse can be a simple string or include token usage
type LLMResponse = string | { text: string; tokenUsage?: number };
```

### AgentFunction

Wrap your agent in this adapter:

```typescript
type AgentFunction = (message: string, history: Turn[]) => Promise<AgentResponse>;

interface AgentResponse {
  text: string;
  toolCalls: ToolCall[];
}
```

### Personas

Built-in personas control how the simulated user communicates:

| Persona | Behavior |
|---------|----------|
| `EXPERT` | Proactive, provides all details upfront |
| `NOVICE` | Minimal info, waits to be asked |
| `EVALUATOR` | Professional, targeted questions |

Custom personas:

```typescript
const FRUSTRATED_CUSTOMER: UserPersona = {
  name: "frustrated",
  description: "Short sentences, impatient, uses caps for emphasis.",
  behaviors: [
    {
      name: "terse",
      description: "Keeps messages under 20 words.",
      violationRubrics: ["The user's message exceeds 30 words."],
    },
  ],
};
```

## Evaluators

### Built-in

**Deterministic:**

- **`createTrajectoryEvaluator`** — Compares actual tool calls against expected. Supports `exact`, `in_order`, and `any_order` match modes.

```typescript
createTrajectoryEvaluator({
  expected: [
    { name: "search_flights", args: { from: "SFO" } },
    { name: "book_flight" },
  ],
  matchMode: "in_order",
  threshold: 1.0,
});
```

**LLM-as-Judge:**

- **`createPlanCompletionEvaluator`** — Were all goals in the plan achieved?
- **`createResponseQualityEvaluator`** — Per-turn scoring against a rubric. Score = average.
- **`createPersonaAdherenceEvaluator`** — Did the simulator stay in character? (validates simulation quality)
- **`createKnowledgeRetentionEvaluator`** — Does the agent remember facts from earlier turns?
- **`createConversationRelevancyEvaluator`** — Does each response stay on topic? (sliding window)

All LLM evaluators take `{ judgeLLM, threshold }` and return scores from 0.0 to 1.0.

### Custom Evaluators

```typescript
import { defineEvaluator } from "convo-eval";

const noApologyOveruse = defineEvaluator({
  name: "no-apology-overuse",
  async evaluate(result) {
    const apologies = result.turns.filter(
      (t) => t.agentResponse.toLowerCase().includes("i apologize")
    ).length;
    const score = Math.max(0, 1 - apologies / result.turns.length);
    return {
      score,
      pass: score >= 0.8,
      reason: `Agent apologized in ${apologies}/${result.turns.length} turns`,
    };
  },
});
```

## How It Works

```
Turn 0:  startingPrompt ──────> Agent ──> response
Turn 1:  Simulator LLM ──────> Agent ──> response
         (plan + persona        │
          + history)            │
           ▲                    │
           └────────────────────┘
              history appended

Terminates when: stop signal emitted | maxTurns reached | error
```

The simulation engine is an async generator that yields `Turn` objects as they complete, enabling real-time progress reporting. The `simulate()` function collects turns into a `SimulationResult`, then `evaluate()` runs all evaluators in parallel.

## API Reference

### Core Functions

| Function | Description |
|----------|-------------|
| `simulate(config)` | Run a simulated conversation, returns `SimulationResult` |
| `evaluate(result, scenario, config)` | Score a simulation with evaluators, returns `EvaluationSummary` |

### Types

| Type | Description |
|------|-------------|
| `LLMFunction` | `(messages: LLMMessage[]) => Promise<LLMResponse>` |
| `AgentFunction` | `(message: string, history: Turn[]) => Promise<AgentResponse>` |
| `ConversationScenario` | Test scenario definition |
| `SimulationResult` | Output of `simulate()` — turns, completion status, token usage |
| `EvaluationSummary` | Output of `evaluate()` — overall pass/fail + per-evaluator results |
| `Evaluator` | Interface for built-in and custom evaluators |

### Exports

```typescript
// Main: "convo-eval"
simulate, evaluate, UserSimulator,
EXPERT, NOVICE, EVALUATOR,
createTrajectoryEvaluator, createPlanCompletionEvaluator,
createResponseQualityEvaluator, createPersonaAdherenceEvaluator,
createKnowledgeRetentionEvaluator, createConversationRelevancyEvaluator,
defineEvaluator, extractLLMText, extractTokenUsage,
ConversationScenarioSchema, ScenarioFileSchema  // Zod schemas

// Vitest: "convo-eval/vitest"
installMatchers  // adds toPassConversationScenario

// Jest: "convo-eval/jest"
installMatchers  // adds toPassConversationScenario
```

## Requirements

- Node.js >= 18
- Runtime dependency: `zod`
- Peer dependencies (optional): `vitest` (for matchers), `@jest/expect` (for matchers)

## License

MIT
