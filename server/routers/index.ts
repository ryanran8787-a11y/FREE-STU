import { router } from "@/server/trpc";
import { chatRouter } from "@/server/routers/chat";
import { generationRouter } from "@/server/routers/generation";
import { noteRouter } from "@/server/routers/note";
import { userRouter } from "@/server/routers/user";

export const appRouter = router({
  chat: chatRouter,
  generation: generationRouter,
  note: noteRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
