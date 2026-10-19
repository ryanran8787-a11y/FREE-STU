import { connection } from "next/server";
import { NoteDetail } from "./NoteDetail";

export async function NoteShell({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ gen?: string }> }) {
  await connection();
  const { id } = await params;
  const gen = (await searchParams)?.gen ?? null;
  return <NoteDetail id={id} initialGenId={gen} />;
}
