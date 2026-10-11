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
    if (!row) return { hasKey: false as const };
    return {
      hasKey: true as const,
      provider: row.provider,
      baseUrl: row.baseUrl,
      model: row.model,
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
});
