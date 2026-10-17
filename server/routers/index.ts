import { router } from "@/server/trpc";
import { attemptRouter } from "@/server/routers/attempt";
import { chatRouter } from "@/server/routers/chat";
import { generationRouter } from "@/server/routers/generation";
import { linkRouter } from "@/server/routers/link";
import { noteRouter } from "@/server/routers/note";
import { planRouter } from "@/server/routers/plan";
import { reviewRouter } from "@/server/routers/review";
import { systemRouter } from "@/server/routers/system";
import { templateRouter } from "@/server/routers/template";
import { usageRouter } from "@/server/routers/usage";
import { userRouter } from "@/server/routers/user";

export const appRouter = router({
  attempt: attemptRouter,
  chat: chatRouter,
  generation: generationRouter,
  link: linkRouter,
  note: noteRouter,
  plan: planRouter,
  review: reviewRouter,
  system: systemRouter,
  template: templateRouter,
  usage: usageRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
