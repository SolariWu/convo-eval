#!/usr/bin/env node

import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadScenarioFile } from "./loader.js";
import { simulate } from "../runner.js";
import type { AgentFunction, LLMFunction, EvaluationSummary } from "../types.js";

async function importModule(filePath: string): Promise<any> {
  const absolutePath = resolve(filePath);
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

  const allResults: Array<{ name: string; simulation: any; evaluation?: EvaluationSummary }> = [];

  for (const scenario of scenarioFile.scenarios) {
    console.log(`\nRunning scenario: ${scenario.name}`);
    const { name, ...scenarioConfig } = scenario;
    const simResult = await simulate({ scenario: scenarioConfig, agentFn, simulatorLLM });
    console.log(`  Turns: ${simResult.turns.length}, Completed: ${simResult.planCompleted}`);
    allResults.push({ name, simulation: simResult });
  }

  if (values.output) {
    writeFileSync(values.output, JSON.stringify(allResults, null, 2));
    console.log(`\nResults written to ${values.output}`);
  }

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
