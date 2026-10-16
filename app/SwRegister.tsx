"use client";

import { useEffect } from "react";

/** 註冊 SW：只在正式版 + 安全上下文（https / localhost）註冊，dev 和 http://LAN-IP 下靜默跳過。 */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
