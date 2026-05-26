"use client";

import { useState, useTransition } from "react";
import { setActiveWorkspaceAction } from "@/app/admin/workspace-actions";

// Phase 6D — small workspace switcher rendered in the admin topbar.
// Shows the current workspace's name with a "Sim" pill when the active
// workspace is a simulation. Clicking opens a list of every workspace
// the user has active membership in. Selecting one calls the server
// action and lets Next.js revalidate the admin route group.

export type WorkspaceSwitcherOption = {
  id: string;
  name: string;
  isSimulation: boolean;
};

type Props = {
  workspaces: ReadonlyArray<WorkspaceSwitcherOption>;
  activeBusinessId: string;
};

export function WorkspaceSwitcher({ workspaces, activeBusinessId }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active =
    workspaces.find((w) => w.id === activeBusinessId) ?? workspaces[0] ?? null;

  if (!active) return null;

  // Single-workspace users never need a switcher. We still render a
  // static label so the page chrome doesn't shift between users.
  const switchable = workspaces.length > 1;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!switchable || isPending}
        onClick={() => {
          setError(null);
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-control border border-line bg-surface px-2 py-1 text-xs text-ink hover:bg-surface-muted disabled:cursor-default disabled:opacity-80"
      >
        <span className="max-w-[12rem] truncate">{active.name}</span>
        {active.isSimulation && (
          <span className="rounded-pill bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-strong">
            Sim
          </span>
        )}
        {switchable && (
          <span aria-hidden="true" className="text-ink-faint">
            ▾
          </span>
        )}
      </button>

      {open && switchable && (
        <div
          role="listbox"
          aria-label="Workspaces"
          className="absolute right-0 mt-1 w-64 rounded-control border border-line bg-surface p-1 text-sm shadow-card"
        >
          {workspaces.map((w) => {
            const isActive = w.id === activeBusinessId;
            return (
              <button
                key={w.id}
                type="button"
                role="option"
                aria-selected={isActive}
                disabled={isPending}
                onClick={() => {
                  if (isActive) {
                    setOpen(false);
                    return;
                  }
                  start(async () => {
                    const r = await setActiveWorkspaceAction({
                      businessId: w.id,
                    });
                    if (r.ok) {
                      setOpen(false);
                      // Force a hard reload so server components re-render
                      // under the new active business without leaning on
                      // client-side cache invalidation.
                      window.location.reload();
                    } else {
                      setError(r.error.message);
                    }
                  });
                }}
                className={
                  "flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left text-ink hover:bg-surface-muted disabled:opacity-50 " +
                  (isActive ? "bg-surface-muted" : "")
                }
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{w.name}</span>
                  {w.isSimulation && (
                    <span className="rounded-pill bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-strong">
                      Sim
                    </span>
                  )}
                </span>
                {isActive && (
                  <span className="text-[11px] text-ink-faint">Active</span>
                )}
              </button>
            );
          })}
          {error && (
            <div className="px-2 py-1 text-xs text-danger">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
