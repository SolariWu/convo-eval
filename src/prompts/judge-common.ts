import { z } from "zod";

const JudgeResponseSchema = z.object({
  score: z.number(),
  reason: z.string(),
});

export interface JudgeResponse {
  score: number;
  reason: string;
}

export function parseJudgeResponse(raw: string): JudgeResponse {
  const jsonMatch = raw.match(/\{[\s\S]*?"score"[\s\S]*?"reason"[\s\S]*?\}/);
  if (!jsonMatch) {
    return { score: 0, reason: `parse error: no JSON found in response: ${raw.slice(0, 200)}` };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const result = JudgeResponseSchema.safeParse(parsed);
    if (!result.success) {
      return { score: 0, reason: `parse error: invalid schema: ${result.error.message}` };
    }
    return {
      score: Math.max(0, Math.min(1, result.data.score)),
      reason: result.data.reason,
    };
  } catch (e) {
    return { score: 0, reason: `parse error: ${(e as Error).message}` };
  }
}

export function formatTranscript(
  turns: Array<{ userMessage: string; agentResponse: string }>
): string {
  return turns
    .map((t, i) => `Turn ${i}:\nUser: ${t.userMessage}\nAgent: ${t.agentResponse}`)
    .join("\n\n");
}
