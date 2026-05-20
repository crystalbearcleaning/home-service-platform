"use client";

import { useState } from "react";
import { sendTestSmsAction, type SendTestSmsResult } from "./actions";
import { UNAUTHORIZED_TROUBLESHOOTING_TIPS } from "./troubleshooting";

type RecipientOption = {
  id: string;
  name: string;
  roleLabel: string | null;
  phoneMasked: string;
};

type Props = {
  recipients: RecipientOption[];
  templateKeys: string[];
  providerConfigured: boolean;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; result: SendTestSmsResult };

export function MessageSmsTestClient({
  recipients,
  templateKeys,
  providerConfigured,
}: Props) {
  const [recipientId, setRecipientId] = useState(recipients[0]?.id ?? "");
  const [templateKey, setTemplateKey] = useState(templateKeys[0] ?? "");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipientId || !templateKey) return;
    setState({ kind: "loading" });
    const result = await sendTestSmsAction({ recipientId, templateKey });
    setState({ kind: "result", result });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">
          Recipient
        </label>
        <select
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
        >
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.roleLabel ? ` — ${r.roleLabel}` : ""} · {r.phoneMasked}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">
          Template
        </label>
        <select
          value={templateKey}
          onChange={(e) => setTemplateKey(e.target.value)}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
        >
          {templateKeys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-ink-faint">
          The seeded sample context (Jane Smith, 8126 Valhalla Dr, Boca
          Raton, Every 3 Months, $439) is used — no real customer is
          contacted.
        </p>
      </div>

      <button
        type="submit"
        disabled={state.kind === "loading" || !recipientId || !templateKey}
        className="rounded-control bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
      >
        {state.kind === "loading"
          ? "Sending…"
          : providerConfigured
            ? "Send one test SMS"
            : "Run with missing config (will skip)"}
      </button>

      {state.kind === "result" && <ResultView result={state.result} />}
    </form>
  );
}

function ResultView({ result }: { result: SendTestSmsResult }) {
  const tone =
    result.ok && result.status === "sent"
      ? "success"
      : result.status === "skipped"
        ? "warning"
        : "danger";
  const toneClasses: Record<typeof tone, string> = {
    success: "border-success bg-success-soft text-success-strong",
    warning: "border-warning bg-warning-soft text-warning-strong",
    danger: "border-danger bg-danger-soft text-danger-strong",
  };
  const showUnauthorizedTips =
    !result.ok && result.error.code === "UPSTREAM_UNAUTHORIZED";

  return (
    <div className="space-y-3">
      <div className={`rounded-card border p-3 text-xs ${toneClasses[tone]}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium uppercase tracking-wide">
            status: {result.status}
          </div>
          {result.logId && (
            <code className="text-[10px] opacity-80">
              log {result.logId.slice(0, 8)}…
            </code>
          )}
        </div>

        {(result.providerStep || result.providerHttpStatus !== null) && (
          <div className="mt-2 text-[11px] opacity-90">
            {result.providerStep && (
              <>
                <span className="opacity-80">step:</span>{" "}
                <code>{result.providerStep}</code>
                {result.providerHttpStatus !== null && " · "}
              </>
            )}
            {result.providerHttpStatus !== null && (
              <>
                <span className="opacity-80">HTTP:</span>{" "}
                <code>{result.providerHttpStatus}</code>
              </>
            )}
          </div>
        )}

        {result.ok ? (
          <div className="mt-2 space-y-1 text-ink">
            <div>
              <span className="text-ink-muted">provider_message_id:</span>{" "}
              <code className="break-all">
                {result.providerMessageId ?? "—"}
              </code>
            </div>
            <div>
              <span className="text-ink-muted">rendered:</span> “
              {result.renderedMessage}”
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            <div>
              <span className="opacity-80">error.code:</span>{" "}
              <code>{result.error.code}</code>
            </div>
            <div>
              <span className="opacity-80">error.message:</span>{" "}
              {result.error.message}
            </div>
            {result.renderedMessage && (
              <div className="text-ink">
                <span className="text-ink-muted">rendered:</span> “
                {result.renderedMessage}”
              </div>
            )}
          </div>
        )}
      </div>

      {showUnauthorizedTips && (
        <div className="rounded-card border border-warning bg-warning-soft p-3 text-[11px] text-warning-strong">
          <div className="font-semibold uppercase tracking-wide">
            401 / 403 troubleshooting
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {UNAUTHORIZED_TROUBLESHOOTING_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <p className="mt-2 opacity-80">
            Secrets are never displayed. Fix the env value in{" "}
            <code>.env.local</code> and restart the dev server before
            retrying.
          </p>
        </div>
      )}
    </div>
  );
}
