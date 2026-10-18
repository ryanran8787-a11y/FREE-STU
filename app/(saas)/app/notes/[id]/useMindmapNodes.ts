"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { deleteNodeFromMd, renameNodeInMd } from "@/lib/mindmap";

/** 心智圖節點操作：改名/刪除/已理解，全都寫回 saveResult。S-2：撞現有標題直接擋。 */
export function useMindmapNodes(args: {
  result: string;
  sources: Record<string, string[]>;
  genId: string;
  masteredInit: string[];
  titles: string[];
  selected: string | null;
  setSelected: (v: string | null) => void;
  onSaved: () => void;
}) {
  const { result, sources, genId, selected, setSelected, onSaved, titles } = args;
  const saveResult = trpc.generation.saveResult.useMutation();
  const setMasteredMut = trpc.generation.setMastered.useMutation();
  const [mastered, setMastered] = useState<Set<string>>(new Set(args.masteredInit));
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  async function persist(newMd: string, newSources: Record<string, string[]>) {
    setSaveMsg("儲存中…");
    try {
      await saveResult.mutateAsync({ id: genId, result: newMd, sourceMap: newSources });
      setSaveMsg("");
      onSaved();
    } catch (e) {
      setSaveMsg(`儲存失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
    }
  }

  function startRename() {
    if (!selected) return;
    setNewName(selected);
    setRenaming(true);
  }

  function doRename() {
    if (!selected) return;
    const name = newName.trim();
    // S-2：撞現有標題會製造同名節點（sourceMap 塌陷），直接擋掉
    if (name !== selected && titles.includes(name)) {
      setSaveMsg("已有同名節點，換個名字");
      return;
    }
    const next = renameNodeInMd(result, selected, name);
    if (!next) {
      setSaveMsg("改名失敗（名稱為空）");
      return;
    }
    const map = { ...sources };
    if (map[selected]) {
      map[name] = map[selected];
      delete map[selected];
    }
    const mNext = new Set(mastered);
    if (mNext.delete(selected)) mNext.add(name);
    setMastered(mNext);
    setMasteredMut.mutate({ id: genId, titles: [...mNext] });
    setRenaming(false);
    setSelected(name);
    persist(next, map);
  }

  function doDelete() {
    if (!selected) return;
    const next = deleteNodeFromMd(result, selected);
    if (!next) {
      setSaveMsg("刪除失敗（不能刪根節點）");
      setConfirmDelete(false);
      return;
    }
    const map = { ...sources };
    delete map[selected];
    setConfirmDelete(false);
    persist(next, map);
  }

  function toggleMastered() {
    if (!selected) return;
    const next = new Set(mastered);
    if (next.has(selected)) next.delete(selected);
    else next.add(selected);
    setMastered(next);
    setMasteredMut.mutate({ id: genId, titles: [...next] });
  }

  return {
    mastered,
    newName,
    setNewName,
    renaming,
    setRenaming,
    confirmDelete,
    setConfirmDelete,
    saveMsg,
    persist,
    startRename,
    doRename,
    doDelete,
    toggleMastered,
  };
}
