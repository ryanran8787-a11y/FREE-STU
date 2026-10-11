import { router } from "@/server/trpc";
import { chatRouter } from "@/server/routers/chat";
import { userRouter } from "@/server/routers/user";

export const appRouter = router({
  chat: chatRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
