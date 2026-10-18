export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reapStaleTasks } = await import("./server/reaper");
    try {
      const r = await reapStaleTasks();
      if (r.generations > 0 || r.plans > 0) {
        console.log(`[reaper] reset ${r.generations} generations, errored ${r.plans} plans`);
      }
    } catch (e) {
      // reaper 不能擋開機：DB 鎖住或 migrate 還沒跑時先放行
      console.error("[reaper] failed:", e instanceof Error ? e.message : e);
    }
  }
}
