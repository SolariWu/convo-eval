export function buildResponseQualityPrompt(rubric: string, userMessage: string, agentResponse: string): string {
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
