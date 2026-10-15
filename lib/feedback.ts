// Kinds of feedback from the footer's "Give feedback" (bug_reports.kind),
// in the order they're offered
export const FEEDBACK_KINDS = [
  {
    value: "bug",
    label: "Something’s broken",
    short: "Bug",
    prompt: "What went wrong?",
    hint: "What did you do, and what happened instead?",
    placeholder: "e.g. I pressed “I’m going” and nothing happened.",
  },
  {
    value: "idea",
    label: "An idea or feature request",
    short: "Idea",
    prompt: "What’s your idea?",
    hint: "What would you like the site to do?",
    placeholder: "e.g. Let me see every show playing near my town this weekend.",
  },
  {
    value: "content",
    label: "Wrong or missing information",
    short: "Info",
    prompt: "What’s wrong or missing?",
    hint: "Tip: signed-in members can also fix a page with its Edit button.",
    placeholder: "e.g. The cast list for this show is missing the ensemble.",
  },
  {
    value: "other",
    label: "Other feedback",
    short: "Other",
    prompt: "What would you like to tell us?",
    hint: "Anything at all: what you like, what’s confusing, what you’d change.",
    placeholder: "",
  },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["value"];

export const feedbackKind = (value: string) => FEEDBACK_KINDS.find((k) => k.value === value) ?? FEEDBACK_KINDS[0];
