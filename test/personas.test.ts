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
