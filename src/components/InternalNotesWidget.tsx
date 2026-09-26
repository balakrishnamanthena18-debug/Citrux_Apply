"use client";

import { useState, useEffect, useTransition } from "react";
import { createInternalNoteAction, getInternalNotesAction } from "@/lib/communication/actions";

export function InternalNotesWidget({
  candidateId,
  applicationId,
  taskId,
}: {
  candidateId?: string;
  applicationId?: string;
  taskId?: string;
}) {
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const fetchNotes = async () => {
    const res = await getInternalNotesAction({ candidateId, applicationId, taskId });
    if (res.success && res.data) {
      setNotes(res.data.notes);
    }
  };

  useEffect(() => {
    let isMounted = true;
    getInternalNotesAction({ candidateId, applicationId, taskId }).then((res) => {
      if (isMounted && res.success && res.data) {
        setNotes(res.data.notes);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [candidateId, applicationId, taskId]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    startTransition(async () => {
      const res = await createInternalNoteAction({
        candidateId,
        applicationId,
        taskId,
        body: newNote.trim(),
      });
      if (res.success) {
        setNewNote("");
        fetchNotes();
      }
    });
  };

  return (
    <div className="bg-amber-50/60 rounded-lg border border-amber-200 p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-amber-500"></span>
          <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide">
            Internal Staff Notes (Staff Only)
          </h3>
        </div>
        <span className="text-[11px] font-medium text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded">
          Confidential • Candidate Blind
        </span>
      </div>

      <form onSubmit={handleAddNote} className="space-y-2">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add operational commentary, verification observations, or incident triage notes..."
          rows={2}
          className="w-full text-xs rounded-md border border-amber-300 p-2.5 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending || !newNote.trim()}
            className="rounded bg-amber-800 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-50 transition"
          >
            {isPending ? "Adding..." : "Add Note"}
          </button>
        </div>
      </form>

      <div className="space-y-2.5 max-h-60 overflow-y-auto">
        {notes.length === 0 ? (
          <p className="text-xs text-amber-700 italic">No internal operational notes recorded yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="bg-white p-3 rounded border border-amber-200/80 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-900">
                  {[note.author?.firstName, note.author?.lastName].filter(Boolean).join(" ") || note.author?.email || "Staff Member"}
                </span>
                <span className="text-slate-400">
                  {new Date(note.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{note.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
