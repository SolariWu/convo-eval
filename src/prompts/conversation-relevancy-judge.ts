export function buildConversationRelevancyPrompt(recentContext: string, currentResponse: string): string {
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
