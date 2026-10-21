// Top-1 卡片協議：判前不洩答案（DeepTutor §9.97，question_card.py 語義）。
// - build_question_card：互動只給 question/options，永不帶 answer/explanation。
// - build_grade_result：判後才釋放 correct + answer。
// 放 lib：前後端共用同一份（app 不能 import @/server/*）；server 判分唯一真相源。

export type QuizItemFull = {
  question: string;
  options: string[];
  answer: number;
  explanation?: string;
};

export type QuizItemInteract = {
  question: string;
  options: string[];
};

/** 去答案：互動通道用（永不夾帶 answer/explanation）。 */
export function stripQuizForInteract(items: QuizItemFull[]): QuizItemInteract[] {
  return items.map((q) => ({ question: q.question, options: q.options }));
}

/** 判後釋放形狀：build_grade_result 語義（只釋放該題）。 */
export type GradeResult = { correct: boolean; answer: number };

/**
 * server 判分：choice 精確匹配（DeepTutor grading.py 語義）。
 * - qIndex/picked 越界 → { correct: false, answer: -1 }（fail-closed，不拋）。
 * - answer 欄位非法（負數/超界）→ 同上（生成物髒資料不炸流程）。
 */
export function gradeQuiz(items: QuizItemFull[], qIndex: number, picked: number): GradeResult {
  const q = items[qIndex];
  if (!q || !Array.isArray(q.options) || q.options.length === 0) return { correct: false, answer: -1 };
  const answer = Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length ? q.answer : -1;
  if (answer === -1) return { correct: false, answer: -1 };
  if (!Number.isInteger(picked) || picked < 0 || picked >= q.options.length) return { correct: false, answer };
  return { correct: picked === answer, answer };
}

/** 生成物 result 安全解析：髒資料回空陣列（fail-closed）。 */
export function parseQuizItems(result: string | null | undefined): QuizItemFull[] {
  if (!result) return [];
  try {
    const v = JSON.parse(result) as unknown;
    if (!Array.isArray(v)) return [];
    return v as QuizItemFull[];
  } catch {
    return [];
  }
}
