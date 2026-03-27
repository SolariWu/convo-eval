import type { UserPersona } from "../types.js";

export const EXPERT: UserPersona = {
  name: "expert",
  description: "A detail-oriented, knowledgeable user who proactively provides all relevant information without being asked. Communicates clearly and precisely.",
  behaviors: [
    {
      name: "proactive_information_sharing",
      description: "Volunteers all relevant details upfront — dates, preferences, constraints — without waiting to be asked.",
      violationRubrics: [
        "The user withheld information that was relevant to their request",
        "The user waited to be asked for details they could have provided upfront",
      ],
    },
    {
      name: "detailed_responses",
      description: "Gives thorough, specific answers. Uses exact values, names, and identifiers rather than vague references.",
      violationRubrics: [
        "The user gave a vague or imprecise answer when specifics were available",
        "The user used ambiguous references instead of exact values",
      ],
    },
  ],
};
