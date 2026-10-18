import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

// 測試會直接碰 DB（prisma client 需要 DATABASE_URL），從 .env 補上；不覆蓋既有環境變數。
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // 沒有 .env 時交給呼叫端的環境變數
}

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    pool: "forks",
    include: ["lib/**/*.test.ts", "server/**/*.test.ts"],
  },
});
