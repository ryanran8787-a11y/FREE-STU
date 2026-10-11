import { connection } from "next/server";
import { NoteDetail } from "./NoteDetail";

export async function NoteShell({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return <NoteDetail id={id} />;
}
