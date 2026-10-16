import { z } from "zod";
import { db } from "@/lib/db";
import { publicProcedure, router } from "@/server/trpc";

const keyInput = z.object({
  provider: z.string().min(1).max(40),
  baseUrl: z.string().url().max(200),
  model: z.string().min(1).max(120),
  apiKey: z.string().max(500).optional(),
});

export const userRouter = router({
  getKeyStatus: publicProcedure.query(async () => {
    const row = await db.userKey.findUnique({ where: { id: "default" } });
    if (!row) return { hasKey: false as const, vision: null };
    return {
      hasKey: true as const,
      provider: row.provider,
      baseUrl: row.baseUrl,
      model: row.model,
      vision: row.visionApiKey
        ? { provider: row.visionProvider ?? "", model: row.visionModel ?? "" }
        : null,
    };
  }),

  setKey: publicProcedure.input(keyInput).mutation(async ({ input }) => {
    const baseUrl = input.baseUrl.replace(/\/+$/, "");
    const existing = await db.userKey.findUnique({ where: { id: "default" } });
    const apiKey = input.apiKey?.trim() || existing?.apiKey;
    if (!apiKey) {
      throw new Error("第一次設定必須填 API Key");
    }
    await db.userKey.upsert({
      where: { id: "default" },
      create: { id: "default", provider: input.provider, baseUrl, model: input.model, apiKey },
      update: { provider: input.provider, baseUrl, model: input.model, apiKey },
    });
    return { ok: true };
  }),

  /** 視覺模型 key（可空）：有填走視覺 OCR，沒填降級本地鏈 */
  setVision: publicProcedure
    .input(
      z.object({
        provider: z.string().max(40).default(""),
        baseUrl: z.string().max(200).default(""),
        model: z.string().max(120).default(""),
        apiKey: z.string().max(500).default(""),
      }),
    )
    .mutation(async ({ input }) => {
      const apiKey = input.apiKey.trim();
      const existing = await db.userKey.findUnique({ where: { id: "default" } });
      if (!existing) throw new Error("先設定主 Key，才能加視覺模型");
      if (apiKey && (!input.baseUrl.trim() || !input.model.trim())) {
        throw new Error("填了視覺 Key，Base URL 和 Model 也要填（或把 Key 清空退回本地鏈）");
      }
      await db.userKey.update({
        where: { id: "default" },
        data: apiKey
          ? {
              visionProvider: input.provider,
              visionBaseUrl: input.baseUrl.replace(/\/+$/, ""),
              visionModel: input.model,
              visionApiKey: apiKey,
            }
          : { visionProvider: null, visionBaseUrl: null, visionModel: null, visionApiKey: null },
      });
      return { ok: true, configured: !!apiKey };
    }),

  getVision: publicProcedure.query(async () => {
    const row = await db.userKey.findUnique({ where: { id: "default" } });
    if (!row?.visionApiKey) return { configured: false as const };
    return {
      configured: true as const,
      provider: row.visionProvider ?? "",
      baseUrl: row.visionBaseUrl ?? "",
      model: row.visionModel ?? "",
    };
  }),

  /** 全域系統提示詞：影響所有新生成與對話（自訂模板/原文除外），不追溯舊的 */
  getSystem: publicProcedure.query(async () => {
    const row = await db.userKey.findUnique({ where: { id: "default" } });
    return { prompt: row?.systemPrompt ?? "" };
  }),

  setSystem: publicProcedure
    .input(z.object({ prompt: z.string().max(2000).default("") }))
    .mutation(async ({ input }) => {
      const existing = await db.userKey.findUnique({ where: { id: "default" } });
      if (!existing) throw new Error("先設定主 Key，才能加全域風格");
      await db.userKey.update({ where: { id: "default" }, data: { systemPrompt: input.prompt.trim() } });
      return { ok: true, configured: input.prompt.trim().length > 0 };
    }),
});
