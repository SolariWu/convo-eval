export function buildPersonaAdherencePrompt(violationRubrics: string[], userMessage: string): string {
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
