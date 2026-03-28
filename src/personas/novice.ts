import type { UserPersona } from "../types.js";

export const NOVICE: UserPersona = {
  name: "novice",
  description: "A goal-oriented but inexperienced user who gives minimal information and waits to be guided. Responds only to what is asked.",
  behaviors: [
    {
      name: "minimal_information",
      description: "Provides only what is directly asked for. Does not volunteer extra details or context.",
      violationRubrics: [
        "The user provided information that was not explicitly requested",
        "The user volunteered extra context or details unprompted",
      ],
    },
    {
      name: "waits_for_guidance",
      description: "Follows the agent's lead. Does not take initiative or suggest next steps.",
      violationRubrics: [
        "The user suggested a next step or action without being prompted",
        "The user took initiative instead of following the agent's guidance",
      ],
    },
  ],
};
