# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

convo-eval is a framework-agnostic, provider-agnostic TypeScript library for multi-turn agent evaluation using LLM-simulated users. It provides a simulation engine that drives conversations between a simulator LLM (playing the user) and an agent-under-test, then scores the results with composable evaluators.

## Commands

```bash
npm test              # Run unit tests (excludes integration/)
npm run test:watch    # Run tests in watch mode
npm run build         # Build CJS+ESM+DTS with tsup
npm run typecheck     # TypeScript type checking

# Run a single test file
npx vitest run test/evaluators/trajectory.test.ts

# Integration test (requires ANTHROPIC_API_KEY)
npx vitest run test/integration/full-scenario.test.ts
```

## Architecture

Five-layer dependency structure (each layer depends only on layers below):

```
CLI (src/cli/)        Matchers (src/matchers/)
       \                    /
     Runner (runner.ts + evaluate.ts)
              |
     Engine (simulator.ts)
              |
     Core (types.ts + personas/ + prompts/)
```

**Core types** (`src/types.ts`): All interfaces + Zod schemas. `LLMFunction` returns `string | { text, tokenUsage? }` for backwards-compatible token tracking.

**Simulator** (`src/simulator.ts`): `UserSimulator` class with async generator `run()` that yields `Turn` objects. Note: messages to the simulator LLM use inverted roles (user messages as "assistant", agent responses as "user") because the simulator *is* the user.

**Evaluators** (`src/evaluators/`): One deterministic (trajectory) and five LLM-as-judge evaluators. All LLM judges share a pattern: structured prompt -> expect JSON `{score, reason}` -> parse with `parseJudgeResponse()` from `src/prompts/judge-common.ts`.

**Package exports**: `convo-eval` (main), `convo-eval/vitest`, `convo-eval/jest` via `package.json` exports field.

## Key Design Decisions

- `LLMFunction` and `AgentFunction` are simple async functions (not classes) to stay framework-agnostic
- JSON-only CLI (no YAML) to avoid `js-yaml` runtime dependency; only runtime dep is `zod`
- `parseJudgeResponse()` uses brace-matching extraction (not regex) for robustness with varied LLM output
- Evaluator factories capture their LLM in closure; the `Evaluator` interface has no `llm` parameter
- Integration tests are gated behind `ANTHROPIC_API_KEY` env var and excluded from default test runs via `vitest.config.ts`
