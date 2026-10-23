// 本地日鍵的回歸測試：守「toISOString 切日會錯、localDayKey 才對」這個 bug。
//
// 台北時區（本專案的實際使用環境，UTC+8）：
// 本地 2026-10-23 01:30 的作答，toISOString() 會給 "2026-10-22T17:30:00.000Z"，
// slice(0,10) = "2026-10-22" → 算到前一天。這是 review.summary 的每日曲線與
// streak 錯位的根因。localDayKey 必須回 "2026-10-23"。
//
// 注意：本檔用本地時間建 Date（不是 new Date("...Z")），所以不管 CI 跑在哪個
// 時區，斷言的都是「同一台機器的本地日」語義，不會因時區不同而紅。
import { describe, expect, it } from "vitest";
import { addLocalDays, localDayKey, startOfLocalDay } from "./local-day";

describe("localDayKey：本地時區切日", () => {
  it("凌晨 01:30 算「當天」，不是前一天（toISOString 會錯的那個 case）", () => {
    const d = new Date(2026, 9, 23, 1, 30, 0); // 本地 2026-10-23 01:30
    expect(localDayKey(d)).toBe("2026-10-23");
    // 對照組：證明「用 UTC 切日會錯」——但這個 bug 只在非 UTC 時區才表現出來。
    // CI 是 ubuntu（UTC），此時 toISOString 與 localDayKey 必然同值，
    // 無條件寫 not.toBe 會讓 CI 紅。所以只在有非零 offset 的時區斷言，
    // 在 UTC 下改為驗證「兩者一致」（等同確認 UTC 時區沒有這個問題）。
    const utcKey = d.toISOString().slice(0, 10);
    const offsetMinutes = d.getTimezoneOffset();
    if (offsetMinutes !== 0) {
      expect(utcKey).not.toBe(localDayKey(d));
    } else {
      expect(utcKey).toBe(localDayKey(d));
    }
  });

  it("本地 00:00 與 23:59 都算同一天", () => {
    expect(localDayKey(new Date(2026, 9, 23, 0, 0, 0, 0))).toBe("2026-10-23");
    expect(localDayKey(new Date(2026, 9, 23, 23, 59, 59, 999))).toBe("2026-10-23");
  });

  it("跨日邊界：23:59:59.999 與隔天 00:00:00.000 是不同天", () => {
    expect(localDayKey(new Date(2026, 9, 23, 23, 59, 59, 999))).toBe("2026-10-23");
    expect(localDayKey(new Date(2026, 9, 24, 0, 0, 0, 0))).toBe("2026-10-24");
  });

  it("月與日補零（個位數月/日也是 YYYY-MM-DD）", () => {
    expect(localDayKey(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
    expect(localDayKey(new Date(2026, 11, 31, 12, 0, 0))).toBe("2026-12-31");
  });

  it("跨年邊界", () => {
    expect(localDayKey(new Date(2026, 11, 31, 23, 30, 0))).toBe("2026-12-31");
    expect(localDayKey(new Date(2027, 0, 1, 0, 30, 0))).toBe("2027-01-01");
  });

  it("鍵的字典序等於時間序（每日曲線排序靠它）", () => {
    const keys = [
      new Date(2026, 9, 23, 1, 0, 0),
      new Date(2026, 8, 30, 12, 0, 0),
      new Date(2026, 9, 1, 0, 5, 0),
      new Date(2027, 0, 2, 0, 0, 0),
    ].map(localDayKey);
    expect([...keys].sort()).toEqual(["2026-09-30", "2026-10-01", "2026-10-23", "2027-01-02"]);
  });
});

describe("addLocalDays：本地日曆日加減", () => {
  it("往前一天跨月", () => {
    expect(localDayKey(addLocalDays(new Date(2026, 9, 1, 0, 0, 0), -1))).toBe("2026-09-30");
  });
  it("往前一天跨年", () => {
    expect(localDayKey(addLocalDays(new Date(2027, 0, 1, 0, 0, 0), -1))).toBe("2026-12-31");
  });
  it("凌晨時刻加減天數不會因 UTC 換算而跳日", () => {
    // 本地 01:30 往回一天：若實作誤用 UTC 加減會落在前一天再被切錯
    const base = new Date(2026, 9, 23, 1, 30, 0);
    expect(localDayKey(addLocalDays(base, -1))).toBe("2026-10-22");
    expect(localDayKey(addLocalDays(base, -2))).toBe("2026-10-21");
  });
  it("不改動傳入的 Date（純函數）", () => {
    const base = new Date(2026, 9, 23, 1, 30, 0);
    const before = base.getTime();
    addLocalDays(base, -5);
    expect(base.getTime()).toBe(before);
  });
});

describe("startOfLocalDay", () => {
  it("回傳本地當天 00:00:00.000", () => {
    const s = startOfLocalDay(new Date(2026, 9, 23, 1, 30, 45, 123));
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
    expect(s.getMilliseconds()).toBe(0);
    expect(localDayKey(s)).toBe("2026-10-23");
  });
  it("不改動傳入的 Date", () => {
    const base = new Date(2026, 9, 23, 1, 30, 0);
    const before = base.getTime();
    startOfLocalDay(base);
    expect(base.getTime()).toBe(before);
  });
});
