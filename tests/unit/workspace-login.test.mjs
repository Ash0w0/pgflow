import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlatformLoginHostname,
  workspaceHostnameForSlug,
} from "../../lib/workspace-login.ts";

test("the apex and www hosts render the platform workspace finder", () => {
  assert.equal(isPlatformLoginHostname("pgflow.co", "pgflow.co"), true);
  assert.equal(isPlatformLoginHostname("www.pgflow.co", "pgflow.co"), true);
  assert.equal(isPlatformLoginHostname("aster-test-house.pgflow.co", "pgflow.co"), false);
  assert.equal(isPlatformLoginHostname("admin.pgflow.co", "pgflow.co"), false);
});

test("workspace names become isolated platform subdomains", () => {
  assert.equal(
    workspaceHostnameForSlug(" Aster-Test-House ", "pgflow.co"),
    "aster-test-house.pgflow.co",
  );
  assert.equal(workspaceHostnameForSlug("aster_test_house", "pgflow.co"), null);
  assert.equal(workspaceHostnameForSlug("www", "pgflow.co"), null);
  assert.equal(workspaceHostnameForSlug("admin", "pgflow.co"), null);
  assert.equal(workspaceHostnameForSlug("-aster", "pgflow.co"), null);
});
