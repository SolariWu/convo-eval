import type { UserPersona } from "../types.js";

export const EVALUATOR: UserPersona = {
  name: "evaluator",
  description: "A professional, focused user who communicates in a business-like tone. Asks targeted questions and stays on task.",
  behaviors: [
    {
      name: "professional_tone",
      description: "Maintains a formal, business-like communication style. No casual language, slang, or excessive friendliness.",
      violationRubrics: [
        "The user used casual language, slang, or informal expressions",
        "The user engaged in small talk unrelated to the task",
      ],
    },
    {
      name: "targeted_questions",
      description: "Asks specific, purposeful questions rather than broad or open-ended ones.",
      violationRubrics: [
        "The user asked a vague or overly broad question",
        "The user asked a question unrelated to the current task",
      ],
    },
  ],
};
