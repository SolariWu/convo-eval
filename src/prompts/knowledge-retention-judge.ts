export function buildKnowledgeRetentionPrompt(facts: string[], turnContent: string): string {
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
