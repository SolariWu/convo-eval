import { z } from "zod";

// ── LLM types ──────────────────────────────────────────────
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LLMResponse = string | { text: string; tokenUsage?: number };
export type LLMFunction = (messages: LLMMessage[]) => Promise<LLMResponse>;

export function extractLLMText(response: LLMResponse): string {
  return typeof response === "string" ? response : response.text;
}

export function extractTokenUsage(response: LLMResponse): number {
  return typeof response === "string" ? 0 : (response.tokenUsage ?? 0);
}

// ── Persona types ──────────────────────────────────────────
export interface PersonaBehavior {
  name: string;
  description: string;
  violationRubrics: string[];
}

export interface UserPersona {
  name: string;
  description: string;
  behaviors: PersonaBehavior[];
}

// ── Scenario ───────────────────────────────────────────────
export interface ConversationScenario {
  startingPrompt: string;
  conversationPlan: string;
  userPersona?: UserPersona;
  maxTurns?: number;
  stopSignal?: string;
}

// ── Tool calls ─────────────────────────────────────────────
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

// ── Agent ──────────────────────────────────────────────────
export interface AgentResponse {
  text: string;
  toolCalls: ToolCall[];
}

export type AgentFunction = (
  message: string,
  history: Turn[]
) => Promise<AgentResponse>;

// ── Turn ───────────────────────────────────────────────────
export interface Turn {
  index: number;
  userMessage: string;
  agentResponse: string;
  toolCalls: ToolCall[];
  durationMs: number;
}

// ── Simulation result ──────────────────────────────────────
export type TerminationReason = "stop_signal" | "max_turns" | "error";

export interface SimulationResult {
  turns: Turn[];
  planCompleted: boolean;
  terminationReason: TerminationReason;
  tokenUsage: { simulator: number; agent: number };
  costEstimate?: { simulator: number; agent: number };
}

// ── Evaluation ─────────────────────────────────────────────
export interface TurnEvalResult {
  turnIndex: number;
  score: number;
  reason: string;
}

export interface EvalResult {
  evaluator: string;
  score: number;
  pass: boolean;
  reason: string;
  perTurn?: TurnEvalResult[];
}

export interface Evaluator {
  name: string;
  evaluate(
    result: SimulationResult,
    scenario: ConversationScenario
  ): Promise<EvalResult>;
}

export interface EvaluationSummary {
  overall: "PASS" | "FAIL";
  evaluators: EvalResult[];
}

// ── Config types ───────────────────────────────────────────
export interface UserSimulatorConfig {
  simulatorLLM: LLMFunction;
  systemPromptOverride?: string;
}

export interface SimulateConfig {
  scenario: ConversationScenario;
  agentFn: AgentFunction;
  simulatorLLM: LLMFunction;
  systemPromptOverride?: string;
}

export interface EvaluateConfig {
  evaluators: Evaluator[];
}

// ── Zod schemas ────────────────────────────────────────────
export const PersonaBehaviorSchema = z.object({
  name: z.string(),
  description: z.string(),
  violationRubrics: z.array(z.string()),
});

export const UserPersonaSchema = z.object({
  name: z.string(),
  description: z.string(),
  behaviors: z.array(PersonaBehaviorSchema),
});

export const ConversationScenarioSchema = z.object({
  startingPrompt: z.string(),
  conversationPlan: z.string(),
  userPersona: UserPersonaSchema.optional(),
  maxTurns: z.number().int().positive().optional(),
  stopSignal: z.string().optional(),
});

export const ScenarioFileSchema = z.object({
  scenarios: z.array(
    ConversationScenarioSchema.extend({
      name: z.string(),
    })
  ),
  evalConfig: z
    .object({
      simulatorModel: z.string().optional(),
      evaluators: z
        .array(
          z.object({
            name: z.string(),
            threshold: z.number().optional(),
            matchMode: z.enum(["exact", "in_order", "any_order"]).optional(),
            rubric: z.string().optional(),
          })
        )
        .optional(),
    })
    .optional(),
});
