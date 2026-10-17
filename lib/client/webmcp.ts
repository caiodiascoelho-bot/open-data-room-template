import { z } from "zod";
import { eventInput } from "../contracts";

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
};
type Context = {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void>;
};
export function registerRoomTools(
  admin: boolean,
  request: <T = Record<string, unknown>>(path: string, options?: RequestInit) => Promise<T>,
  refresh: () => Promise<void>,
) {
  const context = (document as Document & { modelContext?: Context }).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const tools: Tool[] = [
    {
      name: "submit_company_feedback",
      title: "Submit feedback to company",
      description:
        "Send feedback to the company team as the signed-in person. This creates a message.",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "string", maxLength: 80 },
          body: { type: "string", minLength: 3, maxLength: 5000 },
        },
        required: ["page", "body"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const data = z
          .object({ page: z.string().min(1).max(80), body: z.string().trim().min(3).max(5000) })
          .parse(input);
        await request("feedback", { method: "POST", body: JSON.stringify(data) });
        await refresh();
        return { status: "feedback_submitted" };
      },
    },
  ];
  if (admin)
    tools.push({
      name: "create_company_event",
      title: "Create company calendar event",
      description:
        "Create a dated milestone in the company calendar. Admin only. Private to the team by default.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 150 },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          description: { type: "string", maxLength: 3000 },
          kind: { type: "string", enum: ["launch", "milestone", "research", "fundraising"] },
          published: { type: "boolean" },
        },
        required: ["title", "date"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const data = eventInput.parse(input);
        const result = await request("events", { method: "POST", body: JSON.stringify(data) });
        await refresh();
        return { id: result.id, status: "created" };
      },
    });
  for (const tool of tools) {
    try {
      Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch {}
  }
  return () => lifecycle.abort();
}
