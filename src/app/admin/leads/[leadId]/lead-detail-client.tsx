"use client";

import { useState, useTransition } from "react";
import { addLeadNoteAction, completeTaskAction } from "./actions";

type TaskCard = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  category: string;
  completedAt: string | null;
  createdAt: string;
};

type NoteEntry = {
  id: string;
  body: string;
  createdAt: string;
};

type Props =
  | {
      mode?: undefined | "default";
      leadId: string;
      task: TaskCard;
      notes?: never;
    }
  | {
      mode: "notes-only";
      leadId: string;
      notes: NoteEntry[];
      task?: never;
    };

export function LeadDetailClient(props: Props) {
  if (props.mode === "notes-only") {
    return <NotesPanel leadId={props.leadId} initial={props.notes} />;
  }
  return <TaskPanel leadId={props.leadId} task={props.task} />;
}

function TaskPanel({ leadId, task }: { leadId: string; task: TaskCard }) {
  const [taskState, setTaskState] = useState<TaskCard>(task);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const completed = taskState.status === "completed";

  function handleComplete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await completeTaskAction({
        taskId: taskState.id,
        leadId,
        completionNote: note.trim().length > 0 ? note.trim() : null,
      });
      if (r.ok) {
        setTaskState((prev) => ({
          ...prev,
          status: "completed",
          completedAt: new Date().toISOString(),
        }));
        setNote("");
        setSuccess(
          r.data.noteId
            ? "Task completed and note saved."
            : "Task completed.",
        );
      } else {
        setError(`${r.error.code} — ${r.error.message}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">{taskState.title}</div>
          {taskState.description && (
            <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-ink-muted">
              {taskState.description}
            </pre>
          )}
          <div className="mt-2 font-mono text-[11px] text-ink-faint">
            task {taskState.id.slice(0, 8)}… · {taskState.category} ·{" "}
            {new Date(taskState.createdAt).toLocaleString()}
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            completed
              ? "border-success bg-success-soft text-success-strong"
              : "border-line bg-surface text-ink-muted"
          }`}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-pill ${
              completed ? "bg-success" : "bg-ink-faint"
            }`}
          />
          {taskState.status}
        </span>
      </div>

      {completed ? (
        <div className="rounded-control border border-success bg-success-soft p-3 text-xs text-success-strong">
          Completed
          {taskState.completedAt
            ? ` ${new Date(taskState.completedAt).toLocaleString()}`
            : ""}
          .
        </div>
      ) : (
        <form onSubmit={handleComplete} className="space-y-2">
          <label className="block text-xs uppercase tracking-wide text-ink-muted">
            Optional completion note
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Called customer, scheduled for Friday morning."
            maxLength={2000}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-control bg-ink px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-50"
            >
              {isPending ? "Completing…" : "Mark task complete"}
            </button>
            {success && (
              <span className="text-xs text-success-strong">{success}</span>
            )}
            {error && (
              <span className="text-xs text-danger-strong">{error}</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function NotesPanel({
  leadId,
  initial,
}: {
  leadId: string;
  initial: NoteEntry[];
}) {
  const [notes, setNotes] = useState<NoteEntry[]>(initial);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const trimmed = body.trim();
      const r = await addLeadNoteAction({ leadId, body: trimmed });
      if (r.ok) {
        setNotes((prev) => [
          {
            id: r.data.noteId,
            body: trimmed,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setBody("");
      } else {
        setError(`${r.error.code} — ${r.error.message}`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-ink-muted">
          Add internal note
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Plain text. Visible to the team only."
          maxLength={2000}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          required
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="submit"
            disabled={isPending || body.trim().length === 0}
            className="rounded-control bg-ink px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Add note"}
          </button>
          {error && (
            <span className="text-xs text-danger-strong">{error}</span>
          )}
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-xs text-ink-muted">No notes yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {notes.map((n) => (
            <li key={n.id} className="py-2 text-xs">
              <div className="font-mono text-[11px] text-ink-faint">
                {new Date(n.createdAt).toLocaleString()}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap text-ink">
                {n.body}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
