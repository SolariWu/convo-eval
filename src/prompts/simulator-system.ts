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
