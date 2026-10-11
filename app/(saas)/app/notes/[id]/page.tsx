import { Suspense } from "react";
import { NoteShell } from "./NoteShell";

export default function NotePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">讀取中…</p>}>
      <NoteShell params={params} />
    </Suspense>
  );
}
