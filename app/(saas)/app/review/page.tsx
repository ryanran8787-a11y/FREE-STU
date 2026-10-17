import { ReviewDashboard } from "./ReviewDashboard";

export default function ReviewPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">複習與學習紀錄</h1>
        <p className="mt-1 text-sm text-muted">過去 30 天的作答曲線、弱點主題、信心校準。資料來自你作答時的記錄，零 token。</p>
      </div>
      <ReviewDashboard />
    </div>
  );
}
