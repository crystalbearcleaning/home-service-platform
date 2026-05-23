"use client";

import { useState, useTransition } from "react";
import {
  setAutomationEnabledAction,
  setAutomationRecipientAssignmentAction,
} from "../actions";

type Assignment = {
  recipientId: string;
  name: string;
  phoneMasked: string;
  roleLabel: string | null;
  recipientIsActive: boolean;
  assigned: boolean;
  assignmentEnabled: boolean;
};

type ActionResult = { ok: true } | { ok: false; error: { code: string; message: string } };

export function AutomationDetailClient({
  automationId,
  initialEnabled,
  assignments,
}: {
  automationId: string;
  initialEnabled: boolean;
  assignments: Assignment[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [assignmentState, setAssignmentState] = useState<Assignment[]>(assignments);
  const [isPending, startTransition] = useTransition();
  const [enabledError, setEnabledError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string | null>>({});

  function handleToggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    setEnabledError(null);
    startTransition(async () => {
      const r: ActionResult = await setAutomationEnabledAction({
        automationId,
        isEnabled: next,
      });
      if (!r.ok) {
        setEnabled(!next);
        setEnabledError(`${r.error.code} — ${r.error.message}`);
      }
    });
  }

  function handleAssignmentToggle(recipientId: string, nextAssigned: boolean) {
    // Optimistic update.
    setAssignmentState((prev) =>
      prev.map((a) =>
        a.recipientId === recipientId
          ? { ...a, assigned: nextAssigned, assignmentEnabled: nextAssigned ? true : a.assignmentEnabled }
          : a,
      ),
    );
    setRowError((prev) => ({ ...prev, [recipientId]: null }));
    startTransition(async () => {
      const r: ActionResult = await setAutomationRecipientAssignmentAction({
        automationId,
        recipientId,
        assigned: nextAssigned,
        isEnabled: nextAssigned,
      });
      if (!r.ok) {
        // Revert.
        setAssignmentState((prev) =>
          prev.map((a) =>
            a.recipientId === recipientId
              ? { ...a, assigned: !nextAssigned }
              : a,
          ),
        );
        setRowError((prev) => ({
          ...prev,
          [recipientId]: `${r.error.code} — ${r.error.message}`,
        }));
      }
    });
  }

  const noRecipients = assignmentState.length === 0;

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-ink">
              Automation status
            </div>
            <div className="text-xs text-ink-muted">
              When disabled, this automation will skip future triggers.
            </div>
          </div>
          <ToggleButton
            ariaLabel="Toggle automation enabled"
            checked={enabled}
            onClick={handleToggleEnabled}
            disabled={isPending}
            onLabel="Enabled"
            offLabel="Disabled"
          />
        </div>
        {enabledError && (
          <p className="mt-2 text-xs text-danger-strong">{enabledError}</p>
        )}
      </section>

      <section>
        <div className="mb-2 text-sm font-medium text-ink">
          Recipients ({assignmentState.filter((a) => a.assigned).length}{" "}
          assigned)
        </div>
        {noRecipients ? (
          <div className="rounded-control border border-line bg-surface-muted p-3 text-xs text-ink-muted">
            No recipients exist for this workspace yet.
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-control border border-line">
            {assignmentState.map((a) => (
              <li
                key={a.recipientId}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm text-ink">
                    {a.name}{" "}
                    {!a.recipientIsActive && (
                      <span className="ml-1 rounded-pill bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase text-ink-faint">
                        recipient inactive
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    {a.roleLabel ? `${a.roleLabel} · ` : ""}
                    {a.phoneMasked}
                  </div>
                  {rowError[a.recipientId] && (
                    <div className="mt-1 text-[11px] text-danger-strong">
                      {rowError[a.recipientId]}
                    </div>
                  )}
                </div>
                <ToggleButton
                  ariaLabel={`Assign ${a.name}`}
                  checked={a.assigned}
                  disabled={isPending || !a.recipientIsActive}
                  onClick={() =>
                    handleAssignmentToggle(a.recipientId, !a.assigned)
                  }
                  onLabel="Assigned"
                  offLabel="Off"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ToggleButton({
  ariaLabel,
  checked,
  onClick,
  disabled,
  onLabel,
  offLabel,
}: {
  ariaLabel: string;
  checked: boolean;
  onClick: () => void;
  disabled?: boolean;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-pill border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition disabled:opacity-50 ${
        checked
          ? "border-success bg-success-soft text-success-strong"
          : "border-line bg-surface text-ink-muted hover:text-ink"
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-pill ${checked ? "bg-success" : "bg-ink-faint"}`}
      />
      {checked ? onLabel : offLabel}
    </button>
  );
}
