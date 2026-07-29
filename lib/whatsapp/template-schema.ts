export type TemplateParameterSchema = Array<{
  type: "body" | "button";
  subType?: "url" | "quick_reply";
  count: number;
}>;

export const expectedTemplateSchemas: Record<string, TemplateParameterSchema> = {
  welcome_consent: [{ type: "body", count: 2 }],
  rent_reminder: [{ type: "body", count: 5 }, { type: "button", subType: "url", count: 1 }],
  overdue_reminder: [{ type: "body", count: 5 }, { type: "button", subType: "url", count: 1 }],
  proof_received: [{ type: "body", count: 2 }],
  proof_rejected: [{ type: "body", count: 3 }],
  payment_review: [
    { type: "body", count: 6 },
    { type: "button", subType: "quick_reply", count: 1 },
    { type: "button", subType: "quick_reply", count: 1 },
  ],
  payment_action_confirmation: [
    { type: "body", count: 5 },
    { type: "button", subType: "quick_reply", count: 1 },
  ],
  receipt: [{ type: "body", count: 4 }, { type: "button", subType: "url", count: 1 }],
  maintenance_created: [
    { type: "body", count: 4 },
    { type: "button", subType: "quick_reply", count: 1 },
    { type: "button", subType: "quick_reply", count: 1 },
  ],
  maintenance_update: [{ type: "body", count: 4 }],
  move_out_request: [
    { type: "body", count: 2 },
    { type: "button", subType: "quick_reply", count: 1 },
  ],
  move_out_update: [{ type: "body", count: 3 }],
  important_owner_alert: [{ type: "body", count: 3 }],
  weekly_report: [{ type: "body", count: 11 }],
};

export function renderedParameterSchema(components: Array<{
  type: string;
  sub_type?: string;
  parameters?: unknown[];
}>): TemplateParameterSchema {
  return components.map((component) => component.type === "button"
    ? {
        type: "button" as const,
        subType: component.sub_type as "url" | "quick_reply",
        count: component.parameters?.length ?? 0,
      }
    : {
        type: "body" as const,
        count: component.parameters?.length ?? 0,
      });
}

export function metaParameterSchema(components: unknown[]): TemplateParameterSchema {
  const schema: TemplateParameterSchema = [];
  for (const raw of components) {
    if (!raw || typeof raw !== "object") continue;
    const component = raw as {
      type?: string;
      text?: string;
      buttons?: Array<{ type?: string; url?: string }>;
    };
    if (component.type?.toUpperCase() === "BODY") {
      const placeholders = component.text?.match(/\{\{\d+\}\}/g) ?? [];
      schema.push({ type: "body", count: new Set(placeholders).size });
    }
    if (component.type?.toUpperCase() === "BUTTONS") {
      for (const button of component.buttons ?? []) {
        if (button.type?.toUpperCase() === "URL" && /\{\{\d+\}\}/.test(button.url ?? "")) {
          schema.push({ type: "button", subType: "url", count: 1 });
        } else if (button.type?.toUpperCase() === "QUICK_REPLY") {
          schema.push({ type: "button", subType: "quick_reply", count: 1 });
        }
      }
    }
  }
  return schema;
}

export function templateSchemasMatch(
  expected: TemplateParameterSchema,
  actual: TemplateParameterSchema,
) {
  return JSON.stringify(expected) === JSON.stringify(actual);
}
