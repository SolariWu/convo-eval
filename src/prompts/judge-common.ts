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
  // Strategy: try JSON.parse on the full string first, then try extracting JSON by finding matching braces

  // Attempt 1: parse the full string as JSON
  try {
    const parsed = JSON.parse(raw);
    const result = JudgeResponseSchema.safeParse(parsed);
    if (result.success) {
      return {
        score: Math.max(0, Math.min(1, result.data.score)),
        reason: result.data.reason,
      };
    }
  } catch {
    // Not valid JSON, try extraction
  }

  // Attempt 2: find JSON object by matching braces
  const startIdx = raw.indexOf("{");
  if (startIdx === -1) {
    return { score: 0, reason: `parse error: no JSON found in response: ${raw.slice(0, 200)}` };
  }

  // Find matching closing brace
  let depth = 0;
  for (let i = startIdx; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        const jsonStr = raw.slice(startIdx, i + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          const result = JudgeResponseSchema.safeParse(parsed);
          if (result.success) {
            return {
              score: Math.max(0, Math.min(1, result.data.score)),
              reason: result.data.reason,
            };
          }
          return { score: 0, reason: `parse error: invalid schema: ${result.error.message}` };
        } catch (e) {
          return { score: 0, reason: `parse error: ${(e as Error).message}` };
        }
      }
    }
  }

  return { score: 0, reason: `parse error: no valid JSON found in response: ${raw.slice(0, 200)}` };
}

export function formatTranscript(
  turns: Array<{ userMessage: string; agentResponse: string }>
): string {
  return turns
    .map((t, i) => `Turn ${i}:\nUser: ${t.userMessage}\nAgent: ${t.agentResponse}`)
    .join("\n\n");
}
