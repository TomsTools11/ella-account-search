import { z } from "zod";

// Shapes Claude must return for a search. Every item carries its Notion page URL.
// Kept to features structured outputs supports: objects, arrays, strings, nullable, enums, anyOf.

const date = z.string().nullable().describe("ISO date or datetime from Notion, or null");

export const Contact = z.object({
  name: z.string(),
  role: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  url: z.string(),
});

export const Task = z.object({
  title: z.string(),
  status: z.string().describe("To-Do, Waiting on Client, or In Progress"),
  due: date,
  url: z.string(),
});

export const Meeting = z.object({
  title: z.string(),
  date,
  type: z.string().nullable(),
  summaryAvailable: z.boolean().describe("false when the meeting page's summary/notes did not come back or are empty"),
  summary: z.string().nullable().describe("Short summary from the AI meeting note, verbatim or lightly trimmed"),
  actionItems: z.array(z.string()),
  url: z.string(),
});

export const Note = z.object({
  title: z.string(),
  type: z.string().nullable(),
  date,
  preview: z.string().describe("First few lines of the page body, plain text, up to ~300 characters"),
  url: z.string(),
});

export const Project = z.object({
  name: z.string(),
  status: z.string().nullable(),
  startDate: date,
  deadline: date,
  url: z.string(),
});

export const Account = z.object({
  id: z.string().describe("32-character Notion page ID, no dashes"),
  name: z.string(),
  status: z.string().nullable(),
  carrier: z.string().nullable(),
  state: z.string().nullable(),
  campaigns: z.array(z.string()),
  reportingSite: z.string().nullable(),
  url: z.string(),
  pageNotes: z.string().nullable().describe("Notes written in the account page body, plain text, or null if empty"),
});

export const DossierResult = z.object({
  kind: z.literal("dossier"),
  matchedVia: z.string().describe("How the query matched, e.g. 'account name', 'alias Monty', 'contact Weston Willard'"),
  account: Account,
  contacts: z.array(Contact),
  openTasks: z.array(Task),
  latestMeeting: Meeting.nullable().describe("Most recent meeting dated today or earlier"),
  nextMeeting: z
    .object({ title: z.string(), date, type: z.string().nullable(), url: z.string() })
    .nullable()
    .describe("Earliest meeting dated after now, if any"),
  recentNotes: z.array(Note),
  projects: z.array(Project),
});

export const CandidatesResult = z.object({
  kind: z.literal("candidates"),
  candidates: z.array(
    z.object({
      accountId: z.string(),
      accountName: z.string(),
      status: z.string().nullable(),
      reason: z.string().describe("Why it matched, e.g. 'contact Kelsey Berube'"),
      url: z.string(),
    }),
  ),
});

export const NotFoundResult = z.object({
  kind: z.literal("not_found"),
  message: z.string(),
  didYouMean: z
    .object({ accountId: z.string(), accountName: z.string() })
    .nullable()
    .describe("The closest account when the query is near-miss, else null"),
});

export const SearchResponse = z.object({
  result: z.union([DossierResult, CandidatesResult, NotFoundResult]),
});

export type SearchResponse = z.infer<typeof SearchResponse>;
export type Dossier = z.infer<typeof DossierResult>;
export type Candidates = z.infer<typeof CandidatesResult>;
export type NotFound = z.infer<typeof NotFoundResult>;
