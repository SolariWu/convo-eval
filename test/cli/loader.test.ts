import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadScenarioFile } from "../../src/cli/loader.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "convo-eval-test-" + Date.now());

describe("loadScenarioFile", () => {
  beforeAll(() => { mkdirSync(testDir, { recursive: true }); });
  afterAll(() => { rmSync(testDir, { recursive: true, force: true }); });

  it("loads a valid JSON scenario file", () => {
    const filePath = join(testDir, "valid.json");
    writeFileSync(filePath, JSON.stringify({
      scenarios: [{ name: "test", startingPrompt: "Hello", conversationPlan: "Greet and ask about weather" }],
    }));
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
    writeFileSync(filePath, JSON.stringify({ scenarios: [{ name: "test" }] }));
    expect(() => loadScenarioFile(filePath)).toThrow();
  });

  it("throws for non-existent file", () => {
    expect(() => loadScenarioFile(join(testDir, "nope.json"))).toThrow();
  });

  it("loads scenario file with eval config", () => {
    const filePath = join(testDir, "with-config.json");
    writeFileSync(filePath, JSON.stringify({
      scenarios: [{ name: "test", startingPrompt: "Hi", conversationPlan: "Plan" }],
      evalConfig: { evaluators: [{ name: "plan-completion", threshold: 0.8 }] },
    }));
    const result = loadScenarioFile(filePath);
    expect(result.evalConfig?.evaluators).toHaveLength(1);
  });
});
