import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedTemplateSchemas,
  metaParameterSchema,
  renderedParameterSchema,
  templateSchemasMatch,
} from "../../lib/whatsapp/template-schema.ts";

test("Meta template schemas must exactly match PGFlow's approved contract", () => {
  const meta = metaParameterSchema([
    {
      type: "BODY",
      text: "Hi {{1}}, ₹{{2}} is due for {{3}} at {{4}} on {{5}}.",
    },
    {
      type: "BUTTONS",
      buttons: [{ type: "URL", url: "https://pgflow.co/pay/{{1}}" }],
    },
  ]);

  assert.deepEqual(meta, expectedTemplateSchemas.rent_reminder);
  assert.equal(templateSchemasMatch(expectedTemplateSchemas.rent_reminder, meta), true);
  assert.equal(
    templateSchemasMatch(expectedTemplateSchemas.rent_reminder, [{ type: "body", count: 4 }]),
    false,
  );
});

test("rendered template components are checked before dispatch", () => {
  const rendered = renderedParameterSchema([
    {
      type: "body",
      parameters: [{}, {}, {}, {}],
    },
    {
      type: "button",
      sub_type: "quick_reply",
      parameters: [{}],
    },
    {
      type: "button",
      sub_type: "quick_reply",
      parameters: [{}],
    },
  ]);

  assert.deepEqual(rendered, expectedTemplateSchemas.maintenance_created);
});
