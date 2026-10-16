import { router } from "@/server/trpc";
import { chatRouter } from "@/server/routers/chat";
import { generationRouter } from "@/server/routers/generation";
import { noteRouter } from "@/server/routers/note";
import { systemRouter } from "@/server/routers/system";
import { usageRouter } from "@/server/routers/usage";
import { userRouter } from "@/server/routers/user";

export const appRouter = router({
  chat: chatRouter,
  generation: generationRouter,
  note: noteRouter,
  system: systemRouter,
  usage: usageRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
