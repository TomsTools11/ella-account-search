import workspace from "@/config/workspace.json";
import aliasFile from "@/config/aliases.json";

export type Workspace = typeof workspace;
export const ws: Workspace = workspace;
export const aliases: Record<string, string> = aliasFile.aliases;

export const ds = (id: string) => `collection://${id}`;
export const DS = {
  accounts: ds(ws.dataSources.accounts.id),
  contacts: ds(ws.dataSources.contacts.id),
  tasks: ds(ws.dataSources.tasks.id),
  notes: ds(ws.dataSources.notes.id),
  meetingNotes: ds(ws.dataSources.meetingNotes.id),
  projects: ds(ws.dataSources.projects.id),
};

export const model = () => process.env.MODEL || "claude-sonnet-5-5";
