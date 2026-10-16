import os from "os";
import { publicProcedure, router } from "@/server/trpc";

/** 本機連線資訊：設定頁「手機連線」卡用，讓手機開同一個站。 */
export const systemRouter = router({
  lanUrls: publicProcedure.query(() => {
    const port = process.env.PORT ?? "3001";
    const ips = new Set<string>();
    for (const list of Object.values(os.networkInterfaces())) {
      for (const n of list ?? []) {
        // 排除迴環、IPv6、169.254 自配 link-local（連不上，只會干擾）
        if (n.family !== "IPv4" || n.internal || n.address.startsWith("169.254.")) continue;
        ips.add(n.address);
      }
    }
    return { port, urls: [...ips].map((ip) => `http://${ip}:${port}/app/notes`) };
  }),
});
