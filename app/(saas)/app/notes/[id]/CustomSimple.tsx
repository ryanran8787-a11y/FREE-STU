"use client";

import { useState } from "react";
import { SIMPLE_LENGTHS, SIMPLE_METHODS, type SimpleLength, type SimpleMethod } from "@/server/custom";

export type CustomFire = (payload: Record<string, unknown>) => void;

/** 自訂第一層：簡易選項（方法 × 篇幅 × 先提示）。 */
export function CustomSimple({ running, fire }: { running: boolean; fire: CustomFire }) {
  const [method, setMethod] = useState<SimpleMethod>("explain");
  const [length, setLength] = useState<SimpleLength>("standard");
  const [hintFirst, setHintFirst] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {(Object.keys(SIMPLE_METHODS) as SimpleMethod[]).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded border px-2 py-1 text-xs ${method === m ? "invert-chip border-ink" : "border-line text-muted hover:border-muted"}`}
          >
            {SIMPLE_METHODS[m].label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(SIMPLE_LENGTHS) as SimpleLength[]).map((l) => (
          <button
            key={l}
            onClick={() => setLength(l)}
            className={`rounded border px-2 py-1 text-xs ${length === l ? "invert-chip border-ink" : "border-line text-muted hover:border-muted"}`}
          >
            {SIMPLE_LENGTHS[l].label}
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" checked={hintFirst} onChange={(e) => setHintFirst(e.target.checked)} className="accent-[#059669]" />
        先提示再公布答案
      </label>
      <button
        onClick={() => fire({ customKind: "simple", customMethod: method, customLength: length, customHintFirst: hintFirst })}
        disabled={running}
        className="btn-ghost w-full justify-start! text-sm disabled:opacity-50"
      >
        生成自訂
      </button>
    </div>
  );
}
