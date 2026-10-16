/** The 32-hex Notion page ID at the end of a Notion URL (or a bare/dashed ID). */
export const pageIdOf = (urlOrId: string) =>
  urlOrId.replace(/-/g, "").toLowerCase().match(/[0-9a-f]{32}(?=[^0-9a-f]*$)/)?.[0] ?? "";
