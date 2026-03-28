export function buildPlanCompletionPrompt(conversationPlan: string, transcript: string): string {
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
