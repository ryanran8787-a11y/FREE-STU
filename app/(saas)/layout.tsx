import Link from "next/link";
import { TrpcProvider } from "@/app/TrpcProvider";

export default function SaasLayout({ children }: { children: React.ReactNode }) {
  return (
    <TrpcProvider>
      <nav className="flex gap-6 border-b p-4">
        <Link href="/" className="font-bold">
          HSHSA
        </Link>
        <Link href="/app/chat">對話</Link>
        <Link href="/app/settings">設定</Link>
      </nav>
      <main className="mx-auto max-w-2xl p-6">{children}</main>
    </TrpcProvider>
  );
}
