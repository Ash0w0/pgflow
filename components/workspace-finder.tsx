"use client";

import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Building2 } from "lucide-react";
import { workspaceHostnameForSlug } from "@/lib/workspace-login";

type WorkspaceFinderProps = {
  platformDomain: string;
};

export function WorkspaceFinder({ platformDomain }: WorkspaceFinderProps) {
  const [workspace, setWorkspace] = useState("");
  const [error, setError] = useState("");
  const descriptionId = useId();
  const errorId = useId();

  function openWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const hostname = workspaceHostnameForSlug(workspace, platformDomain);
    if (!hostname) {
      setError("Use letters, numbers, and hyphens only—for example, aster-test-house.");
      return;
    }

    const url = new URL(window.location.href);
    url.hostname = hostname;
    url.pathname = "/login";
    url.search = "";
    url.hash = "";
    window.location.assign(url);
  }

  return (
    <form onSubmit={openWorkspace}>
      <label>
        Workspace name
        <div className="input-with-icon">
          <Building2 size={16} aria-hidden="true" />
          <input
            aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
            aria-invalid={Boolean(error)}
            autoCapitalize="none"
            autoComplete="organization"
            autoFocus
            maxLength={63}
            onChange={(event) => {
              setWorkspace(event.target.value);
              setError("");
            }}
            placeholder="aster-test-house"
            spellCheck={false}
            value={workspace}
          />
          <span className="powered-by">.{platformDomain}</span>
        </div>
        <small className="workspace-field-help" id={descriptionId}>
          Use the first part of your PGFlow address.
        </small>
      </label>
      {error ? <p className="login-error" id={errorId} role="alert">{error}</p> : null}
      <button className="button button-primary button-full" type="submit">
        Open workspace <ArrowRight size={16} aria-hidden="true" />
      </button>
    </form>
  );
}
