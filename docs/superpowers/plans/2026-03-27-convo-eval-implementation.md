# convo-eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build convo-eval — a framework-agnostic, provider-agnostic TypeScript library for multi-turn agent evaluation using LLM-simulated users, installable from npm.

**Architecture:** Five-layer architecture (Core → Engine → Runner → Evaluators → Matchers/CLI). The simulation engine drives an async generator loop between a simulator LLM and an agent-under-test. Evaluators score transcripts via deterministic checks or LLM-as-judge patterns. Test matchers integrate with Vitest/Jest. CLI runs JSON scenario files.

**Tech Stack:** TypeScript 5.x, Node 18+, tsup (CJS+ESM), zod, vitest, @anthropic-ai/sdk (dev only)

**Specs:** `specs/spec.md` (original), `docs/superpowers/specs/2026-03-27-convo-eval-design.md` (design)

---

## Parallelization Map

```
Task 1 (Scaffold)
  ↓
Task 2 (Types)
  ↓
┌─────────────────┐
│ Task 3 (Personas)│  ← parallel
│ Task 4 (Prompts) │  ← parallel
└─────────────────┘
  ↓
Task 5 (Simulator) → Task 6 (Runner)
  ↓
┌──────────────────────────────────┐
│ Task 7  (Trajectory evaluator)   │ ← parallel
│ Task 8  (Plan completion eval)   │ ← parallel
│ Task 9  (Response quality eval)  │ ← parallel
│ Task 10 (Persona adherence eval) │ ← parallel
│ Task 11 (Knowledge retention)    │ ← parallel
│ Task 12 (Conversation relevancy) │ ← parallel
└──────────────────────────────────┘
  ↓
Task 13 (Evaluator index + evaluate orchestrator)
  ↓
┌──────────────────────────┐
│ Task 14 (Vitest matchers) │ ← parallel
│ Task 15 (Jest matchers)   │ ← parallel
│ Task 16 (CLI)             │ ← parallel
└──────────────────────────┘
  ↓
Task 17 (Public API + Build)
  ↓
Task 18 (Integration Test)
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tsup.config.ts`
- Create: `.gitignore`
- Create: `.npmignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "convo-eval",
  "version": "0.1.0",
  "description": "Multi-turn agent testing with LLM-simulated users for TypeScript",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./vitest": {
      "import": {
        "types": "./dist/matchers/vitest.d.ts",
        "default": "./dist/matchers/vitest.js"
      },
      "require": {
        "types": "./dist/matchers/vitest.d.cts",
        "default": "./dist/matchers/vitest.cjs"
      }
    },
    "./jest": {
      "import": {
        "types": "./dist/matchers/jest.d.ts",
        "default": "./dist/matchers/jest.js"
      },
      "require": {
        "types": "./dist/matchers/jest.d.cts",
        "default": "./dist/matchers/jest.cjs"
      }
    }
  },
  "bin": {
    "convo-eval": "./dist/cli/index.js"
  },
  "files": [
    "dist",
    "LICENSE",
    "README.md"
  ],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY vitest run test/integration",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit"
  },
  "keywords": [
    "agent",
    "testing",
    "evaluation",
    "multi-turn",
    "conversation",
    "llm",
    "simulator"
  ],
  "author": "Wei Wu",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/SolariWu/convo-eval.git"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^3.0.0"
  },
  "peerDependencies": {
    "vitest": ">=1.0.0",
    "@jest/expect": ">=29.0.0"
  },
  "peerDependenciesMeta": {
    "vitest": {
      "optional": true
    },
    "@jest/expect": {
      "optional": true
    }
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "matchers/vitest": "src/matchers/vitest.ts",
    "matchers/jest": "src/matchers/jest.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "node18",
  outDir: "dist",
});
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["test/**/*.test.ts"],
    exclude: ["test/integration/**"],
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 6: Create .npmignore**

```
src/
test/
docs/
specs/
.claude/
*.config.ts
tsconfig.json
.gitignore
.DS_Store
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: `node_modules` created, `package-lock.json` generated.

- [ ] **Step 8: Verify setup compiles**

Create placeholder `src/index.ts`:
```typescript
export {};
```

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts tsup.config.ts .gitignore .npmignore package-lock.json src/index.ts
git commit -m "feat: project scaffolding with tsup, vitest, typescript"
```

---

### Task 2: Core Types

**Files:**
- Create: `src/types.ts`
- Test: `test/types.test.ts`

- [ ] **Step 1: Write the test for Zod schema validation**

```typescript
// test/types.test.ts
import { describe, it, expect } from "vitest";
import {
  ConversationScenarioSchema,
  ScenarioFileSchema,
  extractLLMText,
  extractTokenUsage,
} from "../src/types.js";

describe("extractLLMText", () => {
  it("extracts text from a string response", () => {
    expect(extractLLMText("hello")).toBe("hello");
  });

  it("extracts text from an object response", () => {
    expect(extractLLMText({ text: "hello", tokenUsage: 10 })).toBe("hello");
  });
});

describe("extractTokenUsage", () => {
  it("returns 0 for a string response", () => {
    expect(extractTokenUsage("hello")).toBe(0);
  });

  it("returns tokenUsage from an object response", () => {
    expect(extractTokenUsage({ text: "hello", tokenUsage: 42 })).toBe(42);
  });

  it("returns 0 when tokenUsage is undefined", () => {
    expect(extractTokenUsage({ text: "hello" })).toBe(0);
  });
});

describe("ConversationScenarioSchema", () => {
  it("validates a minimal scenario", () => {
    const result = ConversationScenarioSchema.safeParse({
      startingPrompt: "Hello",
      conversationPlan: "Ask about the weather",
    });
    expect(result.success).toBe(true);
  });

  it("validates a full scenario with persona", () => {
    const result = ConversationScenarioSchema.safeParse({
      startingPrompt: "Hello",
      conversationPlan: "Ask about the weather",
      maxTurns: 5,
      stopSignal: "DONE",
      userPersona: {
        name: "expert",
        description: "A detail-oriented user",
        behaviors: [
          {
            name: "proactive",
            description: "Provides info upfront",
            violationRubrics: ["Did not provide info"],
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = ConversationScenarioSchema.safeParse({
      startingPrompt: "Hello",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid maxTurns", () => {
    const result = ConversationScenarioSchema.safeParse({
      startingPrompt: "Hello",
      conversationPlan: "Plan",
      maxTurns: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("ScenarioFileSchema", () => {
  it("validates a scenario file with named scenarios", () => {
    const result = ScenarioFileSchema.safeParse({
      scenarios: [
        {
          name: "test-scenario",
          startingPrompt: "Hi",
          conversationPlan: "Do something",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("validates a scenario file with eval config", () => {
    const result = ScenarioFileSchema.safeParse({
      scenarios: [
        {
          name: "test",
          startingPrompt: "Hi",
          conversationPlan: "Plan",
        },
      ],
      evalConfig: {
        evaluators: [
          { name: "plan-completion", threshold: 0.8 },
          { name: "tool-trajectory", matchMode: "in_order", threshold: 1.0 },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/types.test.ts`
Expected: FAIL — module `../src/types.js` not found.

- [ ] **Step 3: Implement types.ts**

```typescript
// src/types.ts
import { z } from "zod";

// ── LLM types ──────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LLMResponse = string | { text: string; tokenUsage?: number };

export type LLMFunction = (messages: LLMMessage[]) => Promise<LLMResponse>;

export function extractLLMText(response: LLMResponse): string {
  return typeof response === "string" ? response : response.text;
}

export function extractTokenUsage(response: LLMResponse): number {
  return typeof response === "string" ? 0 : (response.tokenUsage ?? 0);
}

// ── Persona types ──────────────────────────────────────────

export interface PersonaBehavior {
  name: string;
  description: string;
  violationRubrics: string[];
}

export interface UserPersona {
  name: string;
  description: string;
  behaviors: PersonaBehavior[];
}

// ── Scenario ───────────────────────────────────────────────

export interface ConversationScenario {
  startingPrompt: string;
  conversationPlan: string;
  userPersona?: UserPersona;
  maxTurns?: number;
  stopSignal?: string;
}

// ── Tool calls ─────────────────────────────────────────────

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

// ── Agent ──────────────────────────────────────────────────

export interface AgentResponse {
  text: string;
  toolCalls: ToolCall[];
}

export type AgentFunction = (
  message: string,
  history: Turn[]
) => Promise<AgentResponse>;

// ── Turn ───────────────────────────────────────────────────

export interface Turn {
  index: number;
  userMessage: string;
  agentResponse: string;
  toolCalls: ToolCall[];
  durationMs: number;
}

// ── Simulation result ──────────────────────────────────────

export type TerminationReason = "stop_signal" | "max_turns" | "error";

export interface SimulationResult {
  turns: Turn[];
  planCompleted: boolean;
  terminationReason: TerminationReason;
  tokenUsage: { simulator: number; agent: number };
  costEstimate?: { simulator: number; agent: number };
}

// ── Evaluation ─────────────────────────────────────────────

export interface TurnEvalResult {
  turnIndex: number;
  score: number;
  reason: string;
}

export interface EvalResult {
  evaluator: string;
  score: number;
  pass: boolean;
  reason: string;
  perTurn?: TurnEvalResult[];
}

export interface Evaluator {
  name: string;
  evaluate(
    result: SimulationResult,
    scenario: ConversationScenario,
    llm?: LLMFunction
  ): Promise<EvalResult>;
}

export interface EvaluationSummary {
  overall: "PASS" | "FAIL";
  evaluators: EvalResult[];
}

// ── Config types ───────────────────────────────────────────

export interface UserSimulatorConfig {
  simulatorLLM: LLMFunction;
  systemPromptOverride?: string;
}

export interface SimulateConfig {
  scenario: ConversationScenario;
  agentFn: AgentFunction;
  simulatorLLM: LLMFunction;
  systemPromptOverride?: string;
}

export interface EvaluateConfig {
  evaluators: Evaluator[];
}

// ── Zod schemas (for CLI / runtime validation) ─────────────

export const PersonaBehaviorSchema = z.object({
  name: z.string(),
  description: z.string(),
  violationRubrics: z.array(z.string()),
});

export const UserPersonaSchema = z.object({
  name: z.string(),
  description: z.string(),
  behaviors: z.array(PersonaBehaviorSchema),
});

export const ConversationScenarioSchema = z.object({
  startingPrompt: z.string(),
  conversationPlan: z.string(),
  userPersona: UserPersonaSchema.optional(),
  maxTurns: z.number().int().positive().optional(),
  stopSignal: z.string().optional(),
});

export const ScenarioFileSchema = z.object({
  scenarios: z.array(
    ConversationScenarioSchema.extend({
      name: z.string(),
    })
  ),
  evalConfig: z
    .object({
      simulatorModel: z.string().optional(),
      evaluators: z
        .array(
          z.object({
            name: z.string(),
            threshold: z.number().optional(),
            matchMode: z.enum(["exact", "in_order", "any_order"]).optional(),
            rubric: z.string().optional(),
          })
        )
        .optional(),
    })
    .optional(),
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/types.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts test/types.test.ts
git commit -m "feat: core type definitions and Zod schemas"
```

---

### Task 3: Built-in Personas

**Files:**
- Create: `src/personas/expert.ts`
- Create: `src/personas/novice.ts`
- Create: `src/personas/evaluator.ts`
- Create: `src/personas/index.ts`
- Test: `test/personas.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/personas.test.ts
import { describe, it, expect } from "vitest";
import { EXPERT, NOVICE, EVALUATOR } from "../src/personas/index.js";
import type { UserPersona } from "../src/types.js";

function assertValidPersona(persona: UserPersona) {
  expect(persona.name).toBeTruthy();
  expect(persona.description).toBeTruthy();
  expect(persona.behaviors.length).toBeGreaterThan(0);
  for (const b of persona.behaviors) {
    expect(b.name).toBeTruthy();
    expect(b.description).toBeTruthy();
    expect(b.violationRubrics.length).toBeGreaterThan(0);
  }
}

describe("built-in personas", () => {
  it("EXPERT has valid structure", () => assertValidPersona(EXPERT));
  it("NOVICE has valid structure", () => assertValidPersona(NOVICE));
  it("EVALUATOR has valid structure", () => assertValidPersona(EVALUATOR));

  it("EXPERT is proactive and detail-oriented", () => {
    expect(EXPERT.behaviors.some((b) => b.name.includes("proactive"))).toBe(true);
  });

  it("NOVICE waits to be asked", () => {
    expect(NOVICE.behaviors.some((b) => b.name.includes("minimal"))).toBe(true);
  });

  it("EVALUATOR is professional and focused", () => {
    expect(EVALUATOR.behaviors.some((b) => b.name.includes("professional"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/personas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement personas**

```typescript
// src/personas/expert.ts
import type { UserPersona } from "../types.js";

export const EXPERT: UserPersona = {
  name: "expert",
  description:
    "A detail-oriented, knowledgeable user who proactively provides all relevant information without being asked. Communicates clearly and precisely.",
  behaviors: [
    {
      name: "proactive_information_sharing",
      description:
        "Volunteers all relevant details upfront — dates, preferences, constraints — without waiting to be asked.",
      violationRubrics: [
        "The user withheld information that was relevant to their request",
        "The user waited to be asked for details they could have provided upfront",
      ],
    },
    {
      name: "detailed_responses",
      description:
        "Gives thorough, specific answers. Uses exact values, names, and identifiers rather than vague references.",
      violationRubrics: [
        "The user gave a vague or imprecise answer when specifics were available",
        "The user used ambiguous references instead of exact values",
      ],
    },
  ],
};
```

```typescript
// src/personas/novice.ts
import type { UserPersona } from "../types.js";

export const NOVICE: UserPersona = {
  name: "novice",
  description:
    "A goal-oriented but inexperienced user who gives minimal information and waits to be guided. Responds only to what is asked.",
  behaviors: [
    {
      name: "minimal_information",
      description:
        "Provides only what is directly asked for. Does not volunteer extra details or context.",
      violationRubrics: [
        "The user provided information that was not explicitly requested",
        "The user volunteered extra context or details unprompted",
      ],
    },
    {
      name: "waits_for_guidance",
      description:
        "Follows the agent's lead. Does not take initiative or suggest next steps.",
      violationRubrics: [
        "The user suggested a next step or action without being prompted",
        "The user took initiative instead of following the agent's guidance",
      ],
    },
  ],
};
```

```typescript
// src/personas/evaluator.ts
import type { UserPersona } from "../types.js";

export const EVALUATOR: UserPersona = {
  name: "evaluator",
  description:
    "A professional, focused user who communicates in a business-like tone. Asks targeted questions and stays on task.",
  behaviors: [
    {
      name: "professional_tone",
      description:
        "Maintains a formal, business-like communication style. No casual language, slang, or excessive friendliness.",
      violationRubrics: [
        "The user used casual language, slang, or informal expressions",
        "The user engaged in small talk unrelated to the task",
      ],
    },
    {
      name: "targeted_questions",
      description:
        "Asks specific, purposeful questions rather than broad or open-ended ones.",
      violationRubrics: [
        "The user asked a vague or overly broad question",
        "The user asked a question unrelated to the current task",
      ],
    },
  ],
};
```

```typescript
// src/personas/index.ts
export { EXPERT } from "./expert.js";
export { NOVICE } from "./novice.js";
export { EVALUATOR } from "./evaluator.js";
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/personas.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/personas/ test/personas.test.ts
git commit -m "feat: built-in personas (expert, novice, evaluator)"
```

---

### Task 4: Prompt Templates

**Files:**
- Create: `src/prompts/simulator-system.ts`
- Create: `src/prompts/judge-common.ts`
- Create: `src/prompts/plan-completion-judge.ts`
- Create: `src/prompts/response-quality-judge.ts`
- Create: `src/prompts/persona-adherence-judge.ts`
- Create: `src/prompts/knowledge-retention-judge.ts`
- Create: `src/prompts/conversation-relevancy-judge.ts`
- Test: `test/prompts.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/prompts.test.ts
import { describe, it, expect } from "vitest";
import { buildSimulatorSystemPrompt } from "../src/prompts/simulator-system.js";
import { parseJudgeResponse } from "../src/prompts/judge-common.js";
import { buildPlanCompletionPrompt } from "../src/prompts/plan-completion-judge.js";
import { buildResponseQualityPrompt } from "../src/prompts/response-quality-judge.js";
import { buildPersonaAdherencePrompt } from "../src/prompts/persona-adherence-judge.js";
import { buildKnowledgeRetentionPrompt } from "../src/prompts/knowledge-retention-judge.js";
import { buildConversationRelevancyPrompt } from "../src/prompts/conversation-relevancy-judge.js";

describe("buildSimulatorSystemPrompt", () => {
  it("includes the conversation plan", () => {
    const prompt = buildSimulatorSystemPrompt({
      conversationPlan: "Book a flight to LAX",
      stopSignal: "</finished>",
    });
    expect(prompt).toContain("Book a flight to LAX");
    expect(prompt).toContain("</finished>");
  });

  it("includes persona when provided", () => {
    const prompt = buildSimulatorSystemPrompt({
      conversationPlan: "Plan",
      stopSignal: "</finished>",
      personaDescription: "A frustrated customer",
      personaBehaviors: "- Terse: keeps messages short",
    });
    expect(prompt).toContain("A frustrated customer");
    expect(prompt).toContain("Terse");
  });

  it("uses default persona text when none provided", () => {
    const prompt = buildSimulatorSystemPrompt({
      conversationPlan: "Plan",
      stopSignal: "</finished>",
    });
    expect(prompt).toContain("typical user");
  });
});

describe("parseJudgeResponse", () => {
  it("parses valid JSON with score and reason", () => {
    const result = parseJudgeResponse('{"score": 0.8, "reason": "Good job"}');
    expect(result.score).toBe(0.8);
    expect(result.reason).toBe("Good job");
  });

  it("extracts JSON from surrounding text", () => {
    const result = parseJudgeResponse('Here is my evaluation:\n{"score": 0.5, "reason": "Partial"}\nDone.');
    expect(result.score).toBe(0.5);
  });

  it("returns score 0 for unparseable response", () => {
    const result = parseJudgeResponse("This is not JSON at all");
    expect(result.score).toBe(0);
    expect(result.reason).toContain("parse error");
  });

  it("clamps score to 0-1 range", () => {
    const result = parseJudgeResponse('{"score": 1.5, "reason": "Over"}');
    expect(result.score).toBe(1);
  });
});

describe("judge prompts", () => {
  const transcript = "User: Hi\nAgent: Hello, how can I help?";

  it("buildPlanCompletionPrompt includes plan and transcript", () => {
    const prompt = buildPlanCompletionPrompt("Book a flight", transcript);
    expect(prompt).toContain("Book a flight");
    expect(prompt).toContain(transcript);
  });

  it("buildResponseQualityPrompt includes rubric and turn", () => {
    const prompt = buildResponseQualityPrompt("Be helpful", "User: Hi", "Hello!");
    expect(prompt).toContain("Be helpful");
    expect(prompt).toContain("Hello!");
  });

  it("buildPersonaAdherencePrompt includes rubrics and user message", () => {
    const prompt = buildPersonaAdherencePrompt(
      ["Message exceeds 50 words"],
      "I need help with something"
    );
    expect(prompt).toContain("Message exceeds 50 words");
    expect(prompt).toContain("I need help with something");
  });

  it("buildKnowledgeRetentionPrompt includes facts and turn", () => {
    const prompt = buildKnowledgeRetentionPrompt(
      ["User's name is Alice", "Order number is 1234"],
      "User: What's my order status?\nAgent: Could you tell me your name?"
    );
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("Could you tell me your name");
  });

  it("buildConversationRelevancyPrompt includes context window", () => {
    const prompt = buildConversationRelevancyPrompt(
      "User: Book a flight\nAgent: Sure, where to?",
      "Agent: What color is your car?"
    );
    expect(prompt).toContain("Book a flight");
    expect(prompt).toContain("What color is your car");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/prompts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement prompt templates**

```typescript
// src/prompts/simulator-system.ts

interface SimulatorPromptParams {
  conversationPlan: string;
  stopSignal: string;
  personaDescription?: string;
  personaBehaviors?: string;
}

export function buildSimulatorSystemPrompt(params: SimulatorPromptParams): string {
  const persona = params.personaDescription ?? "a typical user";
  const behaviors = params.personaBehaviors
    ? `\nBEHAVIORS:\n${params.personaBehaviors}`
    : "";

  return `You are simulating a user interacting with an AI agent.

Your goal: Follow the conversation plan below. Generate realistic user messages that pursue these goals. Do NOT break character.

PLAN:
${params.conversationPlan}

PERSONA:
${persona}
${behaviors}

When ALL goals in the plan have been achieved, output EXACTLY this stop signal and nothing else: ${params.stopSignal}

Rules:
- Generate only the next user message
- Do not include any meta-commentary, reasoning, or role labels
- Do not prefix your message with "User:" or similar labels
- Stay in character throughout the conversation`;
}
```

```typescript
// src/prompts/judge-common.ts
import { z } from "zod";

const JudgeResponseSchema = z.object({
  score: z.number(),
  reason: z.string(),
});

export interface JudgeResponse {
  score: number;
  reason: string;
}

export function parseJudgeResponse(raw: string): JudgeResponse {
  // Try to extract JSON from the response
  const jsonMatch = raw.match(/\{[\s\S]*?"score"[\s\S]*?"reason"[\s\S]*?\}/);
  if (!jsonMatch) {
    return { score: 0, reason: `parse error: no JSON found in response: ${raw.slice(0, 200)}` };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const result = JudgeResponseSchema.safeParse(parsed);
    if (!result.success) {
      return { score: 0, reason: `parse error: invalid schema: ${result.error.message}` };
    }
    return {
      score: Math.max(0, Math.min(1, result.data.score)),
      reason: result.data.reason,
    };
  } catch (e) {
    return { score: 0, reason: `parse error: ${(e as Error).message}` };
  }
}

export function formatTranscript(
  turns: Array<{ userMessage: string; agentResponse: string }>
): string {
  return turns
    .map((t, i) => `Turn ${i}:\nUser: ${t.userMessage}\nAgent: ${t.agentResponse}`)
    .join("\n\n");
}
```

```typescript
// src/prompts/plan-completion-judge.ts

export function buildPlanCompletionPrompt(
  conversationPlan: string,
  transcript: string
): string {
  return `You are evaluating whether an AI agent successfully completed all goals in a conversation plan.

CONVERSATION PLAN:
${conversationPlan}

TRANSCRIPT:
${transcript}

Evaluate whether ALL goals in the plan were achieved by the end of the conversation.

Score:
- 1.0 if all goals were fully achieved
- 0.5 if goals were partially achieved
- 0.0 if goals were not achieved

Respond with ONLY a JSON object:
{"score": <number>, "reason": "<explanation>"}`;
}
```

```typescript
// src/prompts/response-quality-judge.ts

export function buildResponseQualityPrompt(
  rubric: string,
  userMessage: string,
  agentResponse: string
): string {
  return `You are evaluating the quality of an AI agent's response.

RUBRIC:
${rubric}

USER MESSAGE:
${userMessage}

AGENT RESPONSE:
${agentResponse}

Score the agent's response from 0.0 (worst) to 1.0 (best) based on the rubric above.

Respond with ONLY a JSON object:
{"score": <number>, "reason": "<explanation>"}`;
}
```

```typescript
// src/prompts/persona-adherence-judge.ts

export function buildPersonaAdherencePrompt(
  violationRubrics: string[],
  userMessage: string
): string {
  const rubricList = violationRubrics.map((r, i) => `${i + 1}. ${r}`).join("\n");

  return `You are evaluating whether a simulated user message violates behavioral constraints.

The following are VIOLATION RUBRICS. If any of these are TRUE for the message, the persona was violated:
${rubricList}

USER MESSAGE:
${userMessage}

Score:
- 1.0 if NONE of the violation rubrics apply (persona maintained)
- 0.0 if ANY violation rubric applies (persona violated)

Respond with ONLY a JSON object:
{"score": <number>, "reason": "<explanation>"}`;
}
```

```typescript
// src/prompts/knowledge-retention-judge.ts

export function buildKnowledgeRetentionPrompt(
  facts: string[],
  turnContent: string
): string {
  const factList = facts.map((f, i) => `${i + 1}. ${f}`).join("\n");

  return `You are evaluating whether an AI agent remembered facts provided by the user earlier in the conversation.

FACTS THE USER PREVIOUSLY STATED:
${factList}

CURRENT TURN:
${turnContent}

Does the agent's response in this turn contradict, forget, or ignore any of the facts listed above?

Score:
- 1.0 if the agent correctly remembers and uses all relevant facts
- 0.5 if the agent partially remembers (some facts correct, some missed)
- 0.0 if the agent contradicts or completely forgets stated facts

Respond with ONLY a JSON object:
{"score": <number>, "reason": "<explanation>"}`;
}
```

```typescript
// src/prompts/conversation-relevancy-judge.ts

export function buildConversationRelevancyPrompt(
  recentContext: string,
  currentResponse: string
): string {
  return `You are evaluating whether an AI agent's response is relevant to the recent conversation context.

RECENT CONVERSATION CONTEXT:
${recentContext}

AGENT RESPONSE BEING EVALUATED:
${currentResponse}

Is the agent's response relevant and on-topic given the recent conversation context?

Score:
- 1.0 if the response is highly relevant and on-topic
- 0.5 if the response is partially relevant but drifts somewhat
- 0.0 if the response is completely off-topic or irrelevant

Respond with ONLY a JSON object:
{"score": <number>, "reason": "<explanation>"}`;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/prompts.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prompts/ test/prompts.test.ts
git commit -m "feat: prompt templates for simulator and all judge evaluators"
```

---

### Task 5: Simulator Engine

**Files:**
- Create: `src/simulator.ts`
- Test: `test/simulator.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/simulator.test.ts
import { describe, it, expect } from "vitest";
import { UserSimulator } from "../src/simulator.js";
import type { AgentFunction, LLMFunction, Turn } from "../src/types.js";

function createMockSimulatorLLM(responses: string[]): LLMFunction {
  let callIndex = 0;
  return async () => {
    const response = responses[callIndex] ?? "</finished>";
    callIndex++;
    return response;
  };
}

function createMockAgent(responses: string[]): AgentFunction {
  let callIndex = 0;
  return async () => {
    const text = responses[callIndex] ?? "Default response";
    callIndex++;
    return { text, toolCalls: [] };
  };
}

describe("UserSimulator", () => {
  it("executes turn 0 with startingPrompt", async () => {
    const agent = createMockAgent(["Agent response 1"]);
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(["</finished>"]),
    });

    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      {
        startingPrompt: "Hello",
        conversationPlan: "Greet the agent",
        maxTurns: 1,
      },
      agent
    )) {
      turns.push(turn);
    }

    expect(turns).toHaveLength(1);
    expect(turns[0].index).toBe(0);
    expect(turns[0].userMessage).toBe("Hello");
    expect(turns[0].agentResponse).toBe("Agent response 1");
  });

  it("runs multiple turns until stop signal", async () => {
    const agent = createMockAgent(["Response 1", "Response 2", "Response 3"]);
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM([
        "Follow-up question 1",
        "Follow-up question 2",
        "</finished>",
      ]),
    });

    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      {
        startingPrompt: "Start",
        conversationPlan: "Ask three questions",
        maxTurns: 10,
      },
      agent
    )) {
      turns.push(turn);
    }

    expect(turns).toHaveLength(3);
    expect(turns[0].userMessage).toBe("Start");
    expect(turns[1].userMessage).toBe("Follow-up question 1");
    expect(turns[2].userMessage).toBe("Follow-up question 2");
  });

  it("stops at maxTurns", async () => {
    const agent = createMockAgent(Array(20).fill("Response"));
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(Array(20).fill("Next question")),
    });

    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      {
        startingPrompt: "Start",
        conversationPlan: "Keep going",
        maxTurns: 3,
      },
      agent
    )) {
      turns.push(turn);
    }

    expect(turns).toHaveLength(3);
  });

  it("uses default maxTurns of 10", async () => {
    const agent = createMockAgent(Array(20).fill("Response"));
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(Array(20).fill("Next")),
    });

    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      {
        startingPrompt: "Start",
        conversationPlan: "Keep going",
      },
      agent
    )) {
      turns.push(turn);
    }

    expect(turns).toHaveLength(10);
  });

  it("uses custom stopSignal", async () => {
    const agent = createMockAgent(["R1", "R2"]);
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(["Question", "DONE"]),
    });

    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      {
        startingPrompt: "Start",
        conversationPlan: "Plan",
        stopSignal: "DONE",
      },
      agent
    )) {
      turns.push(turn);
    }

    expect(turns).toHaveLength(2);
  });

  it("records tool calls from agent", async () => {
    const agent: AgentFunction = async () => ({
      text: "Found flights",
      toolCalls: [{ name: "search_flights", args: { from: "SFO" } }],
    });
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(["</finished>"]),
    });

    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Find flights", conversationPlan: "Search", maxTurns: 1 },
      agent
    )) {
      turns.push(turn);
    }

    expect(turns[0].toolCalls).toHaveLength(1);
    expect(turns[0].toolCalls[0].name).toBe("search_flights");
  });

  it("tracks token usage from LLMResponse objects", async () => {
    const agent = createMockAgent(["Response"]);
    const simulatorLLM: LLMFunction = async () => ({
      text: "</finished>",
      tokenUsage: 50,
    });
    const simulator = new UserSimulator({ simulatorLLM });

    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Start", conversationPlan: "Plan", maxTurns: 2 },
      agent
    )) {
      turns.push(turn);
    }

    expect(simulator.totalSimulatorTokens).toBe(50);
  });

  it("measures turn duration", async () => {
    const agent: AgentFunction = async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { text: "Response", toolCalls: [] };
    };
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(["</finished>"]),
    });

    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Start", conversationPlan: "Plan", maxTurns: 1 },
      agent
    )) {
      turns.push(turn);
    }

    expect(turns[0].durationMs).toBeGreaterThanOrEqual(40);
  });

  it("detects stop signal embedded in longer message", async () => {
    const agent = createMockAgent(["R1"]);
    const simulator = new UserSimulator({
      simulatorLLM: createMockSimulatorLLM(["Some text </finished> more text"]),
    });

    const turns: Turn[] = [];
    for await (const turn of simulator.run(
      { startingPrompt: "Start", conversationPlan: "Plan", maxTurns: 5 },
      agent
    )) {
      turns.push(turn);
    }

    // Only turn 0 (starting prompt) should complete since the simulator
    // emits stop signal on its first call (which would generate turn 1's user message)
    expect(turns).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/simulator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement simulator**

```typescript
// src/simulator.ts
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

    // Build simulator system prompt
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
      // Build conversation history for the simulator
      const messages: LLMMessage[] = [
        { role: "system", content: systemPrompt },
      ];
      for (const t of turns) {
        messages.push({ role: "assistant", content: t.userMessage });
        messages.push({ role: "user", content: t.agentResponse });
      }

      // Call simulator LLM
      const simulatorResponse = await this.config.simulatorLLM(messages);
      const simulatorText = extractLLMText(simulatorResponse);
      this.totalSimulatorTokens += extractTokenUsage(simulatorResponse);

      // Check for stop signal
      if (simulatorText.includes(stopSignal)) {
        break;
      }

      // Send simulator's message to the agent
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/simulator.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulator.ts test/simulator.test.ts
git commit -m "feat: UserSimulator with async generator loop"
```

---

### Task 6: Runner (simulate function)

**Files:**
- Create: `src/runner.ts`
- Test: `test/runner.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/runner.test.ts
import { describe, it, expect } from "vitest";
import { simulate } from "../src/runner.js";
import type { AgentFunction, LLMFunction } from "../src/types.js";

describe("simulate", () => {
  it("collects turns into SimulationResult", async () => {
    const agentFn: AgentFunction = async () => ({
      text: "Agent response",
      toolCalls: [],
    });
    const simulatorLLM: LLMFunction = async () => "</finished>";

    const result = await simulate({
      scenario: {
        startingPrompt: "Hello",
        conversationPlan: "Greet and finish",
        maxTurns: 3,
      },
      agentFn,
      simulatorLLM,
    });

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].userMessage).toBe("Hello");
    expect(result.planCompleted).toBe(true);
    expect(result.terminationReason).toBe("stop_signal");
  });

  it("reports max_turns when plan not completed", async () => {
    let callCount = 0;
    const agentFn: AgentFunction = async () => ({
      text: `Response ${++callCount}`,
      toolCalls: [],
    });
    const simulatorLLM: LLMFunction = async () => "Another question";

    const result = await simulate({
      scenario: {
        startingPrompt: "Start",
        conversationPlan: "Keep asking",
        maxTurns: 3,
      },
      agentFn,
      simulatorLLM,
    });

    expect(result.turns).toHaveLength(3);
    expect(result.planCompleted).toBe(false);
    expect(result.terminationReason).toBe("max_turns");
  });

  it("aggregates simulator token usage", async () => {
    const agentFn: AgentFunction = async () => ({
      text: "Response",
      toolCalls: [],
    });
    const simulatorLLM: LLMFunction = async () => ({
      text: "</finished>",
      tokenUsage: 100,
    });

    const result = await simulate({
      scenario: {
        startingPrompt: "Start",
        conversationPlan: "Plan",
        maxTurns: 3,
      },
      agentFn,
      simulatorLLM,
    });

    expect(result.tokenUsage.simulator).toBe(100);
  });

  it("reports error termination when agent throws", async () => {
    const agentFn: AgentFunction = async () => {
      throw new Error("Agent failed");
    };
    const simulatorLLM: LLMFunction = async () => "Question";

    const result = await simulate({
      scenario: {
        startingPrompt: "Start",
        conversationPlan: "Plan",
        maxTurns: 3,
      },
      agentFn,
      simulatorLLM,
    });

    expect(result.terminationReason).toBe("error");
    expect(result.planCompleted).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/runner.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement runner**

```typescript
// src/runner.ts
import { UserSimulator } from "./simulator.js";
import type {
  SimulateConfig,
  SimulationResult,
  Turn,
} from "./types.js";

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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/runner.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runner.ts test/runner.test.ts
git commit -m "feat: simulate() runner function"
```

---

### Task 7: Trajectory Evaluator

**Files:**
- Create: `src/evaluators/trajectory.ts`
- Test: `test/evaluators/trajectory.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/evaluators/trajectory.test.ts
import { describe, it, expect } from "vitest";
import { createTrajectoryEvaluator } from "../src/evaluators/trajectory.js";
import type { SimulationResult, ConversationScenario } from "../src/types.js";

const scenario: ConversationScenario = {
  startingPrompt: "Book a flight",
  conversationPlan: "Book SFO to LAX",
};

function makeResult(
  toolCalls: Array<{ name: string; args?: Record<string, unknown> }>
): SimulationResult {
  return {
    turns: [
      {
        index: 0,
        userMessage: "Book a flight",
        agentResponse: "Done",
        toolCalls: toolCalls.map((tc) => ({
          name: tc.name,
          args: tc.args ?? {},
        })),
        durationMs: 100,
      },
    ],
    planCompleted: true,
    terminationReason: "stop_signal",
    tokenUsage: { simulator: 0, agent: 0 },
  };
}

describe("createTrajectoryEvaluator", () => {
  describe("exact mode", () => {
    it("scores 1.0 for exact match", async () => {
      const evaluator = createTrajectoryEvaluator({
        expected: [{ name: "search_flights", args: { from: "SFO", to: "LAX" } }],
        matchMode: "exact",
        threshold: 1.0,
      });

      const result = await evaluator.evaluate(
        makeResult([{ name: "search_flights", args: { from: "SFO", to: "LAX" } }]),
        scenario
      );
      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
    });

    it("scores 0 for wrong order in exact mode", async () => {
      const evaluator = createTrajectoryEvaluator({
        expected: [
          { name: "search_flights" },
          { name: "book_flight" },
        ],
        matchMode: "exact",
        threshold: 1.0,
      });

      const result = await evaluator.evaluate(
        makeResult([
          { name: "book_flight" },
          { name: "search_flights" },
        ]),
        scenario
      );
      expect(result.score).toBeLessThan(1.0);
    });

    it("scores 0 when extra calls present in exact mode", async () => {
      const evaluator = createTrajectoryEvaluator({
        expected: [{ name: "search_flights" }],
        matchMode: "exact",
        threshold: 1.0,
      });

      const result = await evaluator.evaluate(
        makeResult([
          { name: "search_flights" },
          { name: "extra_call" },
        ]),
        scenario
      );
      expect(result.score).toBeLessThan(1.0);
    });
  });

  describe("in_order mode", () => {
    it("scores 1.0 when expected calls appear in order", async () => {
      const evaluator = createTrajectoryEvaluator({
        expected: [{ name: "search_flights" }, { name: "book_flight" }],
        matchMode: "in_order",
        threshold: 1.0,
      });

      const result = await evaluator.evaluate(
        makeResult([
          { name: "search_flights" },
          { name: "get_price" },
          { name: "book_flight" },
        ]),
        scenario
      );
      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
    });

    it("scores partial when only some expected calls found", async () => {
      const evaluator = createTrajectoryEvaluator({
        expected: [{ name: "search_flights" }, { name: "book_flight" }],
        matchMode: "in_order",
        threshold: 1.0,
      });

      const result = await evaluator.evaluate(
        makeResult([{ name: "search_flights" }]),
        scenario
      );
      expect(result.score).toBe(0.5);
    });
  });

  describe("any_order mode", () => {
    it("scores 1.0 when all expected calls present regardless of order", async () => {
      const evaluator = createTrajectoryEvaluator({
        expected: [{ name: "book_flight" }, { name: "search_flights" }],
        matchMode: "any_order",
        threshold: 1.0,
      });

      const result = await evaluator.evaluate(
        makeResult([
          { name: "search_flights" },
          { name: "book_flight" },
        ]),
        scenario
      );
      expect(result.score).toBe(1.0);
    });
  });

  describe("partial args matching", () => {
    it("matches when expected args are a subset of actual args", async () => {
      const evaluator = createTrajectoryEvaluator({
        expected: [{ name: "search_flights", args: { from: "SFO" } }],
        matchMode: "exact",
        threshold: 1.0,
      });

      const result = await evaluator.evaluate(
        makeResult([
          { name: "search_flights", args: { from: "SFO", to: "LAX", date: "2026-04-01" } },
        ]),
        scenario
      );
      expect(result.score).toBe(1.0);
    });

    it("fails when expected arg value differs", async () => {
      const evaluator = createTrajectoryEvaluator({
        expected: [{ name: "search_flights", args: { from: "JFK" } }],
        matchMode: "exact",
        threshold: 1.0,
      });

      const result = await evaluator.evaluate(
        makeResult([{ name: "search_flights", args: { from: "SFO" } }]),
        scenario
      );
      expect(result.score).toBe(0);
    });
  });

  describe("threshold", () => {
    it("passes when score meets threshold", async () => {
      const evaluator = createTrajectoryEvaluator({
        expected: [{ name: "search_flights" }, { name: "book_flight" }],
        matchMode: "in_order",
        threshold: 0.5,
      });

      const result = await evaluator.evaluate(
        makeResult([{ name: "search_flights" }]),
        scenario
      );
      expect(result.score).toBe(0.5);
      expect(result.pass).toBe(true);
    });
  });

  describe("multi-turn tool calls", () => {
    it("collects tool calls across all turns", async () => {
      const evaluator = createTrajectoryEvaluator({
        expected: [{ name: "search_flights" }, { name: "book_flight" }],
        matchMode: "in_order",
        threshold: 1.0,
      });

      const result = await evaluator.evaluate(
        {
          turns: [
            {
              index: 0,
              userMessage: "Find flights",
              agentResponse: "Found",
              toolCalls: [{ name: "search_flights", args: {} }],
              durationMs: 100,
            },
            {
              index: 1,
              userMessage: "Book it",
              agentResponse: "Booked",
              toolCalls: [{ name: "book_flight", args: {} }],
              durationMs: 100,
            },
          ],
          planCompleted: true,
          terminationReason: "stop_signal",
          tokenUsage: { simulator: 0, agent: 0 },
        },
        scenario
      );
      expect(result.score).toBe(1.0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/evaluators/trajectory.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement trajectory evaluator**

```typescript
// src/evaluators/trajectory.ts
import type {
  ConversationScenario,
  EvalResult,
  Evaluator,
  SimulationResult,
  ToolCall,
} from "../types.js";

interface ExpectedToolCall {
  name: string;
  args?: Record<string, unknown>;
}

interface TrajectoryConfig {
  expected: ExpectedToolCall[];
  matchMode: "exact" | "in_order" | "any_order";
  threshold: number;
}

function argsMatch(
  expected: Record<string, unknown> | undefined,
  actual: Record<string, unknown>
): boolean {
  if (!expected) return true;
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(value)) return false;
  }
  return true;
}

function toolCallMatches(expected: ExpectedToolCall, actual: ToolCall): boolean {
  return expected.name === actual.name && argsMatch(expected.args, actual.args);
}

function collectAllToolCalls(result: SimulationResult): ToolCall[] {
  return result.turns.flatMap((t) => t.toolCalls);
}

function scoreExact(expected: ExpectedToolCall[], actual: ToolCall[]): number {
  if (expected.length !== actual.length) return 0;
  for (let i = 0; i < expected.length; i++) {
    if (!toolCallMatches(expected[i], actual[i])) return 0;
  }
  return 1.0;
}

function scoreInOrder(expected: ExpectedToolCall[], actual: ToolCall[]): number {
  if (expected.length === 0) return 1.0;
  let matched = 0;
  let actualIdx = 0;
  for (const exp of expected) {
    while (actualIdx < actual.length) {
      if (toolCallMatches(exp, actual[actualIdx])) {
        matched++;
        actualIdx++;
        break;
      }
      actualIdx++;
    }
  }
  return matched / expected.length;
}

function scoreAnyOrder(expected: ExpectedToolCall[], actual: ToolCall[]): number {
  if (expected.length === 0) return 1.0;
  const remaining = [...actual];
  let matched = 0;
  for (const exp of expected) {
    const idx = remaining.findIndex((a) => toolCallMatches(exp, a));
    if (idx !== -1) {
      matched++;
      remaining.splice(idx, 1);
    }
  }
  return matched / expected.length;
}

export function createTrajectoryEvaluator(config: TrajectoryConfig): Evaluator {
  return {
    name: "tool-trajectory",
    async evaluate(
      result: SimulationResult,
      _scenario: ConversationScenario
    ): Promise<EvalResult> {
      const actual = collectAllToolCalls(result);
      let score: number;

      switch (config.matchMode) {
        case "exact":
          score = scoreExact(config.expected, actual);
          break;
        case "in_order":
          score = scoreInOrder(config.expected, actual);
          break;
        case "any_order":
          score = scoreAnyOrder(config.expected, actual);
          break;
      }

      const pass = score >= config.threshold;
      const expectedNames = config.expected.map((e) => e.name).join(", ");
      const actualNames = actual.map((a) => a.name).join(", ");
      const reason = pass
        ? `Tool trajectory matched (${config.matchMode}): [${actualNames}]`
        : `Tool trajectory mismatch (${config.matchMode}). Expected: [${expectedNames}], Got: [${actualNames}]. Score: ${score}`;

      return { evaluator: "tool-trajectory", score, pass, reason };
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/evaluators/trajectory.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/evaluators/trajectory.ts test/evaluators/trajectory.test.ts
git commit -m "feat: trajectory evaluator with exact/in_order/any_order modes"
```

---

### Task 8: Plan Completion Evaluator

**Files:**
- Create: `src/evaluators/plan-completion.ts`
- Test: `test/evaluators/plan-completion.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/evaluators/plan-completion.test.ts
import { describe, it, expect } from "vitest";
import { createPlanCompletionEvaluator } from "../src/evaluators/plan-completion.js";
import type { LLMFunction, SimulationResult, ConversationScenario } from "../src/types.js";

const scenario: ConversationScenario = {
  startingPrompt: "Book a flight",
  conversationPlan: "Book SFO to LAX, morning flight under $150",
};

const result: SimulationResult = {
  turns: [
    { index: 0, userMessage: "Book a flight", agentResponse: "Booked SFO→LAX $120 morning", toolCalls: [], durationMs: 100 },
  ],
  planCompleted: true,
  terminationReason: "stop_signal",
  tokenUsage: { simulator: 0, agent: 0 },
};

describe("createPlanCompletionEvaluator", () => {
  it("passes when judge returns high score", async () => {
    const judgeLLM: LLMFunction = async () =>
      '{"score": 1.0, "reason": "All goals achieved"}';

    const evaluator = createPlanCompletionEvaluator({ judgeLLM, threshold: 0.8 });
    const evalResult = await evaluator.evaluate(result, scenario);

    expect(evalResult.evaluator).toBe("plan-completion");
    expect(evalResult.score).toBe(1.0);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.reason).toBe("All goals achieved");
  });

  it("fails when judge returns low score", async () => {
    const judgeLLM: LLMFunction = async () =>
      '{"score": 0.0, "reason": "No goals met"}';

    const evaluator = createPlanCompletionEvaluator({ judgeLLM, threshold: 0.8 });
    const evalResult = await evaluator.evaluate(result, scenario);

    expect(evalResult.score).toBe(0.0);
    expect(evalResult.pass).toBe(false);
  });

  it("handles malformed LLM response gracefully", async () => {
    const judgeLLM: LLMFunction = async () => "I think it went well!";

    const evaluator = createPlanCompletionEvaluator({ judgeLLM, threshold: 0.8 });
    const evalResult = await evaluator.evaluate(result, scenario);

    expect(evalResult.score).toBe(0);
    expect(evalResult.reason).toContain("parse error");
    expect(evalResult.pass).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/evaluators/plan-completion.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement plan-completion evaluator**

```typescript
// src/evaluators/plan-completion.ts
import type {
  ConversationScenario,
  EvalResult,
  Evaluator,
  LLMFunction,
  SimulationResult,
} from "../types.js";
import { extractLLMText } from "../types.js";
import { parseJudgeResponse, formatTranscript } from "../prompts/judge-common.js";
import { buildPlanCompletionPrompt } from "../prompts/plan-completion-judge.js";

interface PlanCompletionConfig {
  judgeLLM: LLMFunction;
  threshold: number;
}

export function createPlanCompletionEvaluator(config: PlanCompletionConfig): Evaluator {
  return {
    name: "plan-completion",
    async evaluate(
      result: SimulationResult,
      scenario: ConversationScenario
    ): Promise<EvalResult> {
      const transcript = formatTranscript(result.turns);
      const prompt = buildPlanCompletionPrompt(
        scenario.conversationPlan,
        transcript
      );

      const llmResponse = await config.judgeLLM([
        { role: "user", content: prompt },
      ]);
      const parsed = parseJudgeResponse(extractLLMText(llmResponse));

      return {
        evaluator: "plan-completion",
        score: parsed.score,
        pass: parsed.score >= config.threshold,
        reason: parsed.reason,
      };
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/evaluators/plan-completion.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/evaluators/plan-completion.ts test/evaluators/plan-completion.test.ts
git commit -m "feat: plan completion evaluator (LLM-as-judge)"
```

---

### Task 9: Response Quality Evaluator

**Files:**
- Create: `src/evaluators/response-quality.ts`
- Test: `test/evaluators/response-quality.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/evaluators/response-quality.test.ts
import { describe, it, expect } from "vitest";
import { createResponseQualityEvaluator } from "../src/evaluators/response-quality.js";
import type { LLMFunction, SimulationResult, ConversationScenario } from "../src/types.js";

const scenario: ConversationScenario = {
  startingPrompt: "Help me",
  conversationPlan: "Get help",
};

describe("createResponseQualityEvaluator", () => {
  it("averages per-turn scores", async () => {
    let callIndex = 0;
    const judgeLLM: LLMFunction = async () => {
      const scores = [0.8, 0.6];
      return `{"score": ${scores[callIndex++]}, "reason": "Turn eval"}`;
    };

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "Help", agentResponse: "Sure!", toolCalls: [], durationMs: 100 },
        { index: 1, userMessage: "More", agentResponse: "Here", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "stop_signal",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evaluator = createResponseQualityEvaluator({
      judgeLLM,
      rubric: "Be helpful and concise",
      threshold: 0.7,
    });
    const evalResult = await evaluator.evaluate(result, scenario);

    expect(evalResult.score).toBe(0.7);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.perTurn).toHaveLength(2);
    expect(evalResult.perTurn![0].score).toBe(0.8);
    expect(evalResult.perTurn![1].score).toBe(0.6);
  });

  it("handles single turn", async () => {
    const judgeLLM: LLMFunction = async () =>
      '{"score": 0.9, "reason": "Excellent"}';

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "Hi", agentResponse: "Hello!", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "stop_signal",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evaluator = createResponseQualityEvaluator({
      judgeLLM,
      rubric: "Be friendly",
      threshold: 0.5,
    });
    const evalResult = await evaluator.evaluate(result, scenario);

    expect(evalResult.score).toBe(0.9);
    expect(evalResult.pass).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/evaluators/response-quality.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement response quality evaluator**

```typescript
// src/evaluators/response-quality.ts
import type {
  ConversationScenario,
  EvalResult,
  Evaluator,
  LLMFunction,
  SimulationResult,
  TurnEvalResult,
} from "../types.js";
import { extractLLMText } from "../types.js";
import { parseJudgeResponse } from "../prompts/judge-common.js";
import { buildResponseQualityPrompt } from "../prompts/response-quality-judge.js";

interface ResponseQualityConfig {
  judgeLLM: LLMFunction;
  rubric: string;
  threshold: number;
}

export function createResponseQualityEvaluator(config: ResponseQualityConfig): Evaluator {
  return {
    name: "response-quality",
    async evaluate(
      result: SimulationResult,
      _scenario: ConversationScenario
    ): Promise<EvalResult> {
      const perTurn: TurnEvalResult[] = [];

      for (const turn of result.turns) {
        const prompt = buildResponseQualityPrompt(
          config.rubric,
          turn.userMessage,
          turn.agentResponse
        );
        const llmResponse = await config.judgeLLM([
          { role: "user", content: prompt },
        ]);
        const parsed = parseJudgeResponse(extractLLMText(llmResponse));
        perTurn.push({
          turnIndex: turn.index,
          score: parsed.score,
          reason: parsed.reason,
        });
      }

      const score =
        perTurn.length > 0
          ? perTurn.reduce((sum, t) => sum + t.score, 0) / perTurn.length
          : 0;

      // Round to avoid floating point issues
      const roundedScore = Math.round(score * 100) / 100;

      return {
        evaluator: "response-quality",
        score: roundedScore,
        pass: roundedScore >= config.threshold,
        reason: `Average response quality: ${roundedScore} across ${perTurn.length} turns`,
        perTurn,
      };
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/evaluators/response-quality.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/evaluators/response-quality.ts test/evaluators/response-quality.test.ts
git commit -m "feat: response quality evaluator (per-turn LLM rubric scoring)"
```

---

### Task 10: Persona Adherence Evaluator

**Files:**
- Create: `src/evaluators/persona-adherence.ts`
- Test: `test/evaluators/persona-adherence.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/evaluators/persona-adherence.test.ts
import { describe, it, expect } from "vitest";
import { createPersonaAdherenceEvaluator } from "../src/evaluators/persona-adherence.js";
import type { LLMFunction, SimulationResult, ConversationScenario } from "../src/types.js";

const scenario: ConversationScenario = {
  startingPrompt: "Hi",
  conversationPlan: "Ask about flights",
  userPersona: {
    name: "terse",
    description: "Short and to the point",
    behaviors: [
      {
        name: "terse",
        description: "Keeps messages under 20 words",
        violationRubrics: ["The user's message exceeds 30 words"],
      },
    ],
  },
};

const result: SimulationResult = {
  turns: [
    { index: 0, userMessage: "Hi", agentResponse: "Hello!", toolCalls: [], durationMs: 100 },
    { index: 1, userMessage: "Flights?", agentResponse: "Where to?", toolCalls: [], durationMs: 100 },
  ],
  planCompleted: true,
  terminationReason: "stop_signal",
  tokenUsage: { simulator: 0, agent: 0 },
};

describe("createPersonaAdherenceEvaluator", () => {
  it("scores 1.0 when persona maintained across turns", async () => {
    const judgeLLM: LLMFunction = async () =>
      '{"score": 1.0, "reason": "Persona maintained"}';

    const evaluator = createPersonaAdherenceEvaluator({ judgeLLM, threshold: 0.8 });
    const evalResult = await evaluator.evaluate(result, scenario);

    expect(evalResult.evaluator).toBe("persona-adherence");
    expect(evalResult.score).toBe(1.0);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.perTurn).toHaveLength(2);
  });

  it("returns score 1.0 and passes when no persona defined", async () => {
    const judgeLLM: LLMFunction = async () => '{"score": 0.5, "reason": "..."}';
    const scenarioNoPersona: ConversationScenario = {
      startingPrompt: "Hi",
      conversationPlan: "Plan",
    };

    const evaluator = createPersonaAdherenceEvaluator({ judgeLLM, threshold: 0.8 });
    const evalResult = await evaluator.evaluate(result, scenarioNoPersona);

    expect(evalResult.score).toBe(1.0);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.reason).toContain("No persona defined");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/evaluators/persona-adherence.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement persona adherence evaluator**

```typescript
// src/evaluators/persona-adherence.ts
import type {
  ConversationScenario,
  EvalResult,
  Evaluator,
  LLMFunction,
  SimulationResult,
  TurnEvalResult,
} from "../types.js";
import { extractLLMText } from "../types.js";
import { parseJudgeResponse } from "../prompts/judge-common.js";
import { buildPersonaAdherencePrompt } from "../prompts/persona-adherence-judge.js";

interface PersonaAdherenceConfig {
  judgeLLM: LLMFunction;
  threshold: number;
}

export function createPersonaAdherenceEvaluator(config: PersonaAdherenceConfig): Evaluator {
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
          reason: "No persona defined — skipping adherence check",
        };
      }

      const allRubrics = scenario.userPersona.behaviors.flatMap(
        (b) => b.violationRubrics
      );
      const perTurn: TurnEvalResult[] = [];

      for (const turn of result.turns) {
        const prompt = buildPersonaAdherencePrompt(allRubrics, turn.userMessage);
        const llmResponse = await config.judgeLLM([
          { role: "user", content: prompt },
        ]);
        const parsed = parseJudgeResponse(extractLLMText(llmResponse));
        perTurn.push({
          turnIndex: turn.index,
          score: parsed.score,
          reason: parsed.reason,
        });
      }

      const score =
        perTurn.length > 0
          ? Math.round(
              (perTurn.reduce((sum, t) => sum + t.score, 0) / perTurn.length) * 100
            ) / 100
          : 1.0;

      return {
        evaluator: "persona-adherence",
        score,
        pass: score >= config.threshold,
        reason: `Persona adherence: ${score} across ${perTurn.length} turns`,
        perTurn,
      };
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/evaluators/persona-adherence.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/evaluators/persona-adherence.ts test/evaluators/persona-adherence.test.ts
git commit -m "feat: persona adherence evaluator"
```

---

### Task 11: Knowledge Retention Evaluator

**Files:**
- Create: `src/evaluators/knowledge-retention.ts`
- Test: `test/evaluators/knowledge-retention.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/evaluators/knowledge-retention.test.ts
import { describe, it, expect } from "vitest";
import { createKnowledgeRetentionEvaluator } from "../src/evaluators/knowledge-retention.js";
import type { LLMFunction, SimulationResult, ConversationScenario } from "../src/types.js";

const scenario: ConversationScenario = {
  startingPrompt: "My name is Alice and my order is #1234",
  conversationPlan: "Get order status",
};

describe("createKnowledgeRetentionEvaluator", () => {
  it("evaluates knowledge retention across turns", async () => {
    let callIndex = 0;
    const judgeLLM: LLMFunction = async () => {
      // First call: extract facts. Second+: evaluate retention
      if (callIndex++ === 0) {
        return '{"facts": ["User name is Alice", "Order number is 1234"]}';
      }
      return '{"score": 1.0, "reason": "Agent remembered all facts"}';
    };

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "My name is Alice, order #1234", agentResponse: "Hi Alice, checking order #1234", toolCalls: [], durationMs: 100 },
        { index: 1, userMessage: "Any update?", agentResponse: "Alice, your order #1234 is shipped", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "stop_signal",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evaluator = createKnowledgeRetentionEvaluator({ judgeLLM, threshold: 0.8 });
    const evalResult = await evaluator.evaluate(result, scenario);

    expect(evalResult.evaluator).toBe("knowledge-retention");
    expect(evalResult.score).toBe(1.0);
    expect(evalResult.pass).toBe(true);
  });

  it("handles single turn (no retention to check)", async () => {
    const judgeLLM: LLMFunction = async () =>
      '{"facts": ["User name is Alice"]}';

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "I am Alice", agentResponse: "Hi Alice", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "stop_signal",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evaluator = createKnowledgeRetentionEvaluator({ judgeLLM, threshold: 0.8 });
    const evalResult = await evaluator.evaluate(result, scenario);

    expect(evalResult.score).toBe(1.0);
    expect(evalResult.reason).toContain("single turn");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/evaluators/knowledge-retention.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement knowledge retention evaluator**

```typescript
// src/evaluators/knowledge-retention.ts
import { z } from "zod";
import type {
  ConversationScenario,
  EvalResult,
  Evaluator,
  LLMFunction,
  SimulationResult,
  TurnEvalResult,
} from "../types.js";
import { extractLLMText } from "../types.js";
import { parseJudgeResponse } from "../prompts/judge-common.js";
import { buildKnowledgeRetentionPrompt } from "../prompts/knowledge-retention-judge.js";

interface KnowledgeRetentionConfig {
  judgeLLM: LLMFunction;
  threshold: number;
}

const FactsResponseSchema = z.object({
  facts: z.array(z.string()),
});

function parseFacts(raw: string): string[] {
  try {
    const match = raw.match(/\{[\s\S]*?"facts"[\s\S]*?\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    const result = FactsResponseSchema.safeParse(parsed);
    return result.success ? result.data.facts : [];
  } catch {
    return [];
  }
}

export function createKnowledgeRetentionEvaluator(config: KnowledgeRetentionConfig): Evaluator {
  return {
    name: "knowledge-retention",
    async evaluate(
      result: SimulationResult,
      _scenario: ConversationScenario
    ): Promise<EvalResult> {
      if (result.turns.length <= 1) {
        return {
          evaluator: "knowledge-retention",
          score: 1.0,
          pass: true,
          reason: "Only single turn — no retention to evaluate",
        };
      }

      // Step 1: Extract facts from user messages in early turns
      const userMessages = result.turns.map((t) => t.userMessage).join("\n");
      const extractPrompt = `Extract all factual information the user stated in these messages. Return as JSON: {"facts": ["fact1", "fact2", ...]}\n\nMessages:\n${userMessages}`;
      const extractResponse = await config.judgeLLM([
        { role: "user", content: extractPrompt },
      ]);
      const facts = parseFacts(extractLLMText(extractResponse));

      if (facts.length === 0) {
        return {
          evaluator: "knowledge-retention",
          score: 1.0,
          pass: true,
          reason: "No extractable facts found in user messages",
        };
      }

      // Step 2: Check retention in later turns (skip turn 0)
      const perTurn: TurnEvalResult[] = [];
      for (let i = 1; i < result.turns.length; i++) {
        const turn = result.turns[i];
        const turnContent = `User: ${turn.userMessage}\nAgent: ${turn.agentResponse}`;
        const prompt = buildKnowledgeRetentionPrompt(facts, turnContent);
        const llmResponse = await config.judgeLLM([
          { role: "user", content: prompt },
        ]);
        const parsed = parseJudgeResponse(extractLLMText(llmResponse));
        perTurn.push({
          turnIndex: turn.index,
          score: parsed.score,
          reason: parsed.reason,
        });
      }

      const score =
        perTurn.length > 0
          ? Math.round(
              (perTurn.reduce((sum, t) => sum + t.score, 0) / perTurn.length) * 100
            ) / 100
          : 1.0;

      return {
        evaluator: "knowledge-retention",
        score,
        pass: score >= config.threshold,
        reason: `Knowledge retention: ${score} across ${perTurn.length} turns (${facts.length} facts tracked)`,
        perTurn,
      };
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/evaluators/knowledge-retention.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/evaluators/knowledge-retention.ts test/evaluators/knowledge-retention.test.ts
git commit -m "feat: knowledge retention evaluator"
```

---

### Task 12: Conversation Relevancy Evaluator

**Files:**
- Create: `src/evaluators/conversation-relevancy.ts`
- Test: `test/evaluators/conversation-relevancy.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/evaluators/conversation-relevancy.test.ts
import { describe, it, expect } from "vitest";
import { createConversationRelevancyEvaluator } from "../src/evaluators/conversation-relevancy.js";
import type { LLMFunction, SimulationResult, ConversationScenario } from "../src/types.js";

const scenario: ConversationScenario = {
  startingPrompt: "Book a flight",
  conversationPlan: "Book SFO to LAX",
};

describe("createConversationRelevancyEvaluator", () => {
  it("evaluates relevancy with sliding window", async () => {
    const judgeLLM: LLMFunction = async () =>
      '{"score": 0.9, "reason": "On topic"}';

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "Book flight", agentResponse: "Where to?", toolCalls: [], durationMs: 100 },
        { index: 1, userMessage: "SFO to LAX", agentResponse: "When?", toolCalls: [], durationMs: 100 },
        { index: 2, userMessage: "Next Tuesday", agentResponse: "Found flights", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "stop_signal",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evaluator = createConversationRelevancyEvaluator({
      judgeLLM,
      threshold: 0.7,
      windowSize: 3,
    });
    const evalResult = await evaluator.evaluate(result, scenario);

    expect(evalResult.evaluator).toBe("conversation-relevancy");
    expect(evalResult.score).toBe(0.9);
    expect(evalResult.pass).toBe(true);
    expect(evalResult.perTurn).toHaveLength(3);
  });

  it("uses default window size of 3", async () => {
    const judgeLLM: LLMFunction = async () =>
      '{"score": 1.0, "reason": "Relevant"}';

    const result: SimulationResult = {
      turns: [
        { index: 0, userMessage: "Hi", agentResponse: "Hello", toolCalls: [], durationMs: 100 },
      ],
      planCompleted: true,
      terminationReason: "stop_signal",
      tokenUsage: { simulator: 0, agent: 0 },
    };

    const evaluator = createConversationRelevancyEvaluator({
      judgeLLM,
      threshold: 0.7,
    });
    const evalResult = await evaluator.evaluate(result, scenario);

    expect(evalResult.score).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/evaluators/conversation-relevancy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement conversation relevancy evaluator**

```typescript
// src/evaluators/conversation-relevancy.ts
import type {
  ConversationScenario,
  EvalResult,
  Evaluator,
  LLMFunction,
  SimulationResult,
  TurnEvalResult,
} from "../types.js";
import { extractLLMText } from "../types.js";
import { parseJudgeResponse } from "../prompts/judge-common.js";
import { buildConversationRelevancyPrompt } from "../prompts/conversation-relevancy-judge.js";

interface ConversationRelevancyConfig {
  judgeLLM: LLMFunction;
  threshold: number;
  windowSize?: number;
}

export function createConversationRelevancyEvaluator(
  config: ConversationRelevancyConfig
): Evaluator {
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

        // Build context window from preceding turns
        const windowStart = Math.max(0, i - windowSize);
        const contextTurns = result.turns.slice(windowStart, i);
        const recentContext =
          contextTurns.length > 0
            ? contextTurns
                .map((t) => `User: ${t.userMessage}\nAgent: ${t.agentResponse}`)
                .join("\n\n")
            : `User: ${turn.userMessage}`;

        const prompt = buildConversationRelevancyPrompt(
          recentContext,
          `Agent: ${turn.agentResponse}`
        );
        const llmResponse = await config.judgeLLM([
          { role: "user", content: prompt },
        ]);
        const parsed = parseJudgeResponse(extractLLMText(llmResponse));
        perTurn.push({
          turnIndex: turn.index,
          score: parsed.score,
          reason: parsed.reason,
        });
      }

      const score =
        perTurn.length > 0
          ? Math.round(
              (perTurn.reduce((sum, t) => sum + t.score, 0) / perTurn.length) * 100
            ) / 100
          : 1.0;

      return {
        evaluator: "conversation-relevancy",
        score,
        pass: score >= config.threshold,
        reason: `Conversation relevancy: ${score} across ${perTurn.length} turns (window=${windowSize})`,
        perTurn,
      };
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/evaluators/conversation-relevancy.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/evaluators/conversation-relevancy.ts test/evaluators/conversation-relevancy.test.ts
git commit -m "feat: conversation relevancy evaluator with sliding window"
```

---

### Task 13: Evaluator Index + evaluate() Orchestrator

**Files:**
- Create: `src/evaluators/index.ts`
- Create: `src/evaluate.ts`
- Test: `test/evaluate.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/evaluate.test.ts
import { describe, it, expect } from "vitest";
import { evaluate } from "../src/evaluate.js";
import { defineEvaluator } from "../src/evaluators/index.js";
import type { SimulationResult, ConversationScenario } from "../src/types.js";

const scenario: ConversationScenario = {
  startingPrompt: "Hi",
  conversationPlan: "Greet",
};

const result: SimulationResult = {
  turns: [
    { index: 0, userMessage: "Hi", agentResponse: "Hello!", toolCalls: [], durationMs: 100 },
  ],
  planCompleted: true,
  terminationReason: "stop_signal",
  tokenUsage: { simulator: 0, agent: 0 },
};

describe("defineEvaluator", () => {
  it("creates an evaluator from a config object", async () => {
    const ev = defineEvaluator({
      name: "custom",
      async evaluate() {
        return { score: 0.9, pass: true, reason: "Good" };
      },
    });

    expect(ev.name).toBe("custom");
    const evalResult = await ev.evaluate(result, scenario);
    expect(evalResult.evaluator).toBe("custom");
    expect(evalResult.score).toBe(0.9);
  });
});

describe("evaluate", () => {
  it("runs all evaluators and returns summary", async () => {
    const ev1 = defineEvaluator({
      name: "always-pass",
      async evaluate() {
        return { score: 1.0, pass: true, reason: "Pass" };
      },
    });
    const ev2 = defineEvaluator({
      name: "always-fail",
      async evaluate() {
        return { score: 0.0, pass: false, reason: "Fail" };
      },
    });

    const summary = await evaluate(result, scenario, {
      evaluators: [ev1, ev2],
    });

    expect(summary.overall).toBe("FAIL");
    expect(summary.evaluators).toHaveLength(2);
    expect(summary.evaluators[0].evaluator).toBe("always-pass");
    expect(summary.evaluators[1].evaluator).toBe("always-fail");
  });

  it("reports PASS when all evaluators pass", async () => {
    const ev = defineEvaluator({
      name: "pass",
      async evaluate() {
        return { score: 0.9, pass: true, reason: "OK" };
      },
    });

    const summary = await evaluate(result, scenario, { evaluators: [ev] });
    expect(summary.overall).toBe("PASS");
  });

  it("runs evaluators in parallel", async () => {
    const order: string[] = [];
    const ev1 = defineEvaluator({
      name: "slow",
      async evaluate() {
        await new Promise((r) => setTimeout(r, 50));
        order.push("slow");
        return { score: 1.0, pass: true, reason: "OK" };
      },
    });
    const ev2 = defineEvaluator({
      name: "fast",
      async evaluate() {
        order.push("fast");
        return { score: 1.0, pass: true, reason: "OK" };
      },
    });

    await evaluate(result, scenario, { evaluators: [ev1, ev2] });
    // fast should finish before slow since they run in parallel
    expect(order[0]).toBe("fast");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/evaluate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement evaluator index**

```typescript
// src/evaluators/index.ts
import type { EvalResult, Evaluator, SimulationResult, ConversationScenario, LLMFunction } from "../types.js";

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
    scenario: ConversationScenario,
    llm?: LLMFunction
  ): Promise<Omit<EvalResult, "evaluator">>;
}

export function defineEvaluator(config: DefineEvaluatorConfig): Evaluator {
  return {
    name: config.name,
    async evaluate(
      result: SimulationResult,
      scenario: ConversationScenario,
      llm?: LLMFunction
    ): Promise<EvalResult> {
      const evalResult = await config.evaluate(result, scenario, llm);
      return { evaluator: config.name, ...evalResult };
    },
  };
}
```

- [ ] **Step 4: Implement evaluate orchestrator**

```typescript
// src/evaluate.ts
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
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/evaluate.test.ts`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/evaluators/index.ts src/evaluate.ts test/evaluate.test.ts
git commit -m "feat: evaluator index, defineEvaluator helper, evaluate orchestrator"
```

---

### Task 14: Vitest Matchers

**Files:**
- Create: `src/matchers/vitest.ts`
- Test: `test/matchers/vitest.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/matchers/vitest.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { installMatchers } from "../src/matchers/vitest.js";
import type { AgentFunction, LLMFunction } from "../src/types.js";

beforeAll(() => {
  installMatchers();
});

const mockAgent: AgentFunction = async () => ({
  text: "I can help with that!",
  toolCalls: [],
});

const mockSimulatorLLM: LLMFunction = async () => "</finished>";

describe("toPassConversationScenario", () => {
  it("passes when all evaluators pass", async () => {
    const mockJudge: LLMFunction = async () =>
      '{"score": 1.0, "reason": "All good"}';

    await expect(mockAgent).toPassConversationScenario(
      {
        startingPrompt: "Help me",
        conversationPlan: "Get assistance",
        maxTurns: 2,
      },
      {
        simulatorLLM: mockSimulatorLLM,
        evaluators: [
          {
            name: "mock-eval",
            async evaluate() {
              return { evaluator: "mock-eval", score: 1.0, pass: true, reason: "OK" };
            },
          },
        ],
        threshold: 0.8,
      }
    );
  });

  it("fails when an evaluator fails", async () => {
    await expect(async () => {
      await expect(mockAgent).toPassConversationScenario(
        {
          startingPrompt: "Help",
          conversationPlan: "Plan",
          maxTurns: 2,
        },
        {
          simulatorLLM: mockSimulatorLLM,
          evaluators: [
            {
              name: "fail-eval",
              async evaluate() {
                return { evaluator: "fail-eval", score: 0.1, pass: false, reason: "Bad" };
              },
            },
          ],
          threshold: 0.8,
        }
      );
    }).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/matchers/vitest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement Vitest matchers**

```typescript
// src/matchers/vitest.ts
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

// Type augmentation for Vitest
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/matchers/vitest.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/matchers/vitest.ts test/matchers/vitest.test.ts
git commit -m "feat: Vitest custom matchers (toPassConversationScenario)"
```

---

### Task 15: Jest Matchers

**Files:**
- Create: `src/matchers/jest.ts`

Note: No test file for Jest matchers — we don't install Jest as a dev dependency. The Jest matchers follow the same pattern as Vitest but use `expect.extend` from Jest globals.

- [ ] **Step 1: Implement Jest matchers**

```typescript
// src/matchers/jest.ts
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
  if (typeof expect === "undefined" || typeof (expect as any).extend !== "function") {
    throw new Error(
      "convo-eval/jest: `expect.extend` not found. Make sure Jest is installed and this is called inside a Jest test environment."
    );
  }

  (expect as any).extend({
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
```

- [ ] **Step 2: Commit**

```bash
git add src/matchers/jest.ts
git commit -m "feat: Jest custom matchers"
```

---

### Task 16: CLI

**Files:**
- Create: `src/cli/loader.ts`
- Create: `src/cli/index.ts`
- Test: `test/cli/loader.test.ts`

- [ ] **Step 1: Write failing test for loader**

```typescript
// test/cli/loader.test.ts
import { describe, it, expect } from "vitest";
import { loadScenarioFile } from "../src/cli/loader.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "convo-eval-test-" + Date.now());

describe("loadScenarioFile", () => {
  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("loads a valid JSON scenario file", () => {
    const filePath = join(testDir, "valid.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        scenarios: [
          {
            name: "test",
            startingPrompt: "Hello",
            conversationPlan: "Greet and ask about weather",
          },
        ],
      })
    );

    const result = loadScenarioFile(filePath);
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].name).toBe("test");
    expect(result.scenarios[0].startingPrompt).toBe("Hello");
  });

  it("throws for invalid JSON content", () => {
    const filePath = join(testDir, "invalid.json");
    writeFileSync(filePath, "not json");

    expect(() => loadScenarioFile(filePath)).toThrow();
  });

  it("throws for missing required fields", () => {
    const filePath = join(testDir, "missing.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        scenarios: [{ name: "test" }],
      })
    );

    expect(() => loadScenarioFile(filePath)).toThrow();
  });

  it("throws for non-existent file", () => {
    expect(() => loadScenarioFile(join(testDir, "nope.json"))).toThrow();
  });

  it("loads scenario file with eval config", () => {
    const filePath = join(testDir, "with-config.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        scenarios: [
          {
            name: "test",
            startingPrompt: "Hi",
            conversationPlan: "Plan",
          },
        ],
        evalConfig: {
          evaluators: [{ name: "plan-completion", threshold: 0.8 }],
        },
      })
    );

    const result = loadScenarioFile(filePath);
    expect(result.evalConfig?.evaluators).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli/loader.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement loader**

```typescript
// src/cli/loader.ts
import { readFileSync } from "node:fs";
import { ScenarioFileSchema } from "../types.js";
import type { z } from "zod";

export type ScenarioFile = z.infer<typeof ScenarioFileSchema>;

export function loadScenarioFile(filePath: string): ScenarioFile {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read scenario file: ${filePath} — ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON in ${filePath}: ${(err as Error).message}`);
  }

  const result = ScenarioFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid scenario file ${filePath}:\n${issues}`);
  }

  return result.data;
}
```

- [ ] **Step 4: Run loader tests**

Run: `npx vitest run test/cli/loader.test.ts`
Expected: All PASS.

- [ ] **Step 5: Implement CLI entry point**

```typescript
// src/cli/index.ts
#!/usr/bin/env node

import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadScenarioFile } from "./loader.js";
import { simulate } from "../runner.js";
import { evaluate } from "../evaluate.js";
import type { AgentFunction, LLMFunction, EvaluationSummary } from "../types.js";

async function importModule(filePath: string): Promise<any> {
  const absolutePath = resolve(filePath);
  // Try direct import first (works for .js, .mjs)
  // For .ts files, user needs tsx or ts-node in their environment
  return import(absolutePath);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      agent: { type: "string" },
      simulator: { type: "string" },
      output: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(`convo-eval — Multi-turn agent testing

Usage:
  convo-eval run <scenarios.json> --agent <adapter> --simulator <llm>

Options:
  --agent <path>       Path to file default-exporting an AgentFunction
  --simulator <path>   Path to file default-exporting an LLMFunction
  --output <path>      Write results to JSON file
  -h, --help           Show this help`);
    process.exit(0);
  }

  const command = positionals[0];
  if (command !== "run") {
    console.error(`Unknown command: ${command}. Use "run".`);
    process.exit(1);
  }

  const scenarioPath = positionals[1];
  if (!scenarioPath) {
    console.error("Missing scenario file path.");
    process.exit(1);
  }
  if (!values.agent) {
    console.error("Missing --agent flag.");
    process.exit(1);
  }
  if (!values.simulator) {
    console.error("Missing --simulator flag.");
    process.exit(1);
  }

  const scenarioFile = loadScenarioFile(scenarioPath);

  const agentModule = await importModule(values.agent);
  const agentFn: AgentFunction = agentModule.default;
  if (typeof agentFn !== "function") {
    console.error(`--agent file must default-export a function. Got: ${typeof agentFn}`);
    process.exit(1);
  }

  const simulatorModule = await importModule(values.simulator);
  const simulatorLLM: LLMFunction = simulatorModule.default;
  if (typeof simulatorLLM !== "function") {
    console.error(`--simulator file must default-export a function. Got: ${typeof simulatorLLM}`);
    process.exit(1);
  }

  const allResults: Array<{
    name: string;
    simulation: any;
    evaluation?: EvaluationSummary;
  }> = [];

  for (const scenario of scenarioFile.scenarios) {
    console.log(`\nRunning scenario: ${scenario.name}`);
    const { name, ...scenarioConfig } = scenario;

    const simResult = await simulate({
      scenario: scenarioConfig,
      agentFn,
      simulatorLLM,
    });

    console.log(`  Turns: ${simResult.turns.length}, Completed: ${simResult.planCompleted}`);

    allResults.push({ name, simulation: simResult });
  }

  if (values.output) {
    writeFileSync(values.output, JSON.stringify(allResults, null, 2));
    console.log(`\nResults written to ${values.output}`);
  }

  // Print summary
  console.log("\n--- Summary ---");
  for (const r of allResults) {
    const status = r.simulation.planCompleted ? "COMPLETED" : "INCOMPLETE";
    console.log(`  ${r.name}: ${status} (${r.simulation.turns.length} turns)`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
```

- [ ] **Step 6: Commit**

```bash
git add src/cli/ test/cli/
git commit -m "feat: CLI with JSON scenario loader"
```

---

### Task 17: Public API + Build

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Implement public API exports**

```typescript
// src/index.ts

// Core types
export type {
  LLMMessage,
  LLMResponse,
  LLMFunction,
  PersonaBehavior,
  UserPersona,
  ConversationScenario,
  ToolCall,
  AgentResponse,
  AgentFunction,
  Turn,
  TerminationReason,
  SimulationResult,
  TurnEvalResult,
  EvalResult,
  Evaluator,
  EvaluationSummary,
  UserSimulatorConfig,
  SimulateConfig,
  EvaluateConfig,
} from "./types.js";

// Utility functions
export { extractLLMText, extractTokenUsage } from "./types.js";

// Zod schemas
export {
  ConversationScenarioSchema,
  ScenarioFileSchema,
  UserPersonaSchema,
  PersonaBehaviorSchema,
} from "./types.js";

// Core functions
export { simulate } from "./runner.js";
export { evaluate } from "./evaluate.js";

// Simulator
export { UserSimulator } from "./simulator.js";

// Personas
export { EXPERT, NOVICE, EVALUATOR } from "./personas/index.js";

// Evaluators
export {
  createTrajectoryEvaluator,
  createPlanCompletionEvaluator,
  createResponseQualityEvaluator,
  createPersonaAdherenceEvaluator,
  createKnowledgeRetentionEvaluator,
  createConversationRelevancyEvaluator,
  defineEvaluator,
} from "./evaluators/index.js";
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Build the package**

Run: `npx tsup`
Expected: `dist/` directory created with `index.js`, `index.cjs`, `index.d.ts`, `matchers/vitest.js`, `matchers/jest.js`, `cli/index.js` and corresponding type declarations.

- [ ] **Step 4: Verify the build output**

Run: `ls dist/ && ls dist/matchers/ && ls dist/cli/`
Expected: All expected files present.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: public API exports"
```

---

### Task 18: Integration Test

**Files:**
- Create: `test/integration/full-scenario.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// test/integration/full-scenario.test.ts
import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  simulate,
  evaluate,
  createPlanCompletionEvaluator,
  createResponseQualityEvaluator,
  EXPERT,
} from "../src/index.js";
import type { AgentFunction, LLMFunction } from "../src/types.js";

const SKIP = !process.env.ANTHROPIC_API_KEY;

describe.skipIf(SKIP)("integration: full scenario with Claude", () => {
  const anthropic = new Anthropic();

  const claudeLLM: LLMFunction = async (messages) => {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Ensure messages alternate and start with user
    const sanitized: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const msg of chatMessages) {
      if (sanitized.length === 0 && msg.role !== "user") {
        sanitized.push({ role: "user", content: "(start)" });
      }
      if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === msg.role) {
        sanitized[sanitized.length - 1].content += "\n" + msg.content;
      } else {
        sanitized.push({ ...msg });
      }
    }

    if (sanitized.length === 0) {
      sanitized.push({ role: "user", content: "(start)" });
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemMsg?.content,
      messages: sanitized,
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    return {
      text,
      tokenUsage: response.usage.output_tokens,
    };
  };

  // Simple Claude-powered agent
  const agentFn: AgentFunction = async (message, history) => {
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const turn of history) {
      messages.push({ role: "user", content: turn.userMessage });
      messages.push({ role: "assistant", content: turn.agentResponse });
    }
    messages.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:
        "You are a helpful travel assistant. Help users book flights and answer travel questions. Be concise.",
      messages,
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    return { text, toolCalls: [] };
  };

  it(
    "runs a full scenario: simulate + evaluate",
    async () => {
      const result = await simulate({
        scenario: {
          startingPrompt:
            "I need to fly from San Francisco to Los Angeles next Tuesday morning. What are my options?",
          conversationPlan:
            "Ask about flights from SFO to LAX for next Tuesday morning. Prefer flights under $200. If the agent suggests options, pick the cheapest one.",
          userPersona: EXPERT,
          maxTurns: 5,
        },
        agentFn,
        simulatorLLM: claudeLLM,
      });

      // Simulation should produce at least 1 turn
      expect(result.turns.length).toBeGreaterThanOrEqual(1);
      expect(result.turns[0].userMessage).toContain("San Francisco");

      // Token usage should be tracked
      expect(result.tokenUsage.simulator).toBeGreaterThanOrEqual(0);

      // Run evaluators
      const summary = await evaluate(
        result,
        {
          startingPrompt: result.turns[0].userMessage,
          conversationPlan: "Ask about flights from SFO to LAX",
          userPersona: EXPERT,
        },
        {
          evaluators: [
            createPlanCompletionEvaluator({ judgeLLM: claudeLLM, threshold: 0.3 }),
            createResponseQualityEvaluator({
              judgeLLM: claudeLLM,
              rubric:
                "The agent should be helpful, relevant, and provide travel-related information.",
              threshold: 0.3,
            }),
          ],
        }
      );

      // Verify evaluation structure
      expect(summary.evaluators).toHaveLength(2);
      for (const evalResult of summary.evaluators) {
        expect(evalResult.score).toBeGreaterThanOrEqual(0);
        expect(evalResult.score).toBeLessThanOrEqual(1);
        expect(evalResult.reason).toBeTruthy();
      }

      console.log("Integration test results:");
      console.log(`  Turns: ${result.turns.length}`);
      console.log(`  Plan completed: ${result.planCompleted}`);
      console.log(`  Overall: ${summary.overall}`);
      for (const e of summary.evaluators) {
        console.log(`  ${e.evaluator}: ${e.score.toFixed(2)} (${e.pass ? "PASS" : "FAIL"}) — ${e.reason}`);
      }
    },
    { timeout: 120_000 }
  );
});
```

- [ ] **Step 2: Run integration test (requires ANTHROPIC_API_KEY)**

Run: `npx vitest run test/integration/full-scenario.test.ts`
Expected: If `ANTHROPIC_API_KEY` is set, test runs and PASSES. If not set, test is skipped.

- [ ] **Step 3: Verify unit tests still pass**

Run: `npx vitest run`
Expected: All unit tests PASS (integration test skipped without API key).

- [ ] **Step 4: Commit**

```bash
git add test/integration/full-scenario.test.ts
git commit -m "feat: integration test with real Claude API"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec sections 1-9 implemented — simulation engine, 6 evaluators, 3 personas, Vitest + Jest matchers, CLI with JSON loader, programmatic API
- [x] **No placeholders:** Every step has complete code
- [x] **Type consistency:** `LLMFunction`, `AgentFunction`, `Evaluator`, all interfaces consistent across tasks
- [x] **Import paths:** All use `.js` extension for ESM compatibility
- [x] **Spec section 3.4 (Turn/ToolCall):** Covered in types
- [x] **Spec section 4.3 (simulator prompt):** Template in prompts/simulator-system.ts
- [x] **Spec section 5.3 (defineEvaluator):** In evaluators/index.ts
- [x] **Spec section 6.1 (matchers):** Vitest + Jest
- [x] **Spec section 6.2 (programmatic API):** simulate() + evaluate()
- [x] **Spec section 6.3 (CLI):** cli/index.ts + loader.ts
- [x] **Spec section 7 (scenario format):** Zod schema + JSON loader
- [x] **Design decision: LLMResponse union type:** Implemented in types.ts
- [x] **Design decision: JSON-only CLI:** No yaml dependency
- [x] **Design decision: Node 18+:** tsconfig target ES2022, engines field
