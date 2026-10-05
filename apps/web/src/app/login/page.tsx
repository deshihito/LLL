import Link from "next/link";
import Image from "next/image";
import AuthButtons from "@/components/auth-buttons";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7fbfb] px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <Image
          src="/lll-logo.jpg"
          alt="LLL"
          width={320}
          height={175}
          priority
          className="h-auto w-full max-w-[280px] object-contain"
        />
        <div className="login-invitation"><span className="overline">CREATE · COLLECT · CONNECT</span><h1>あなたの想像を、切り札に。</h1><p>自分だけのカードを作り、デッキを組み、仲間とバトル。</p><Link href="/practice" className="primary-button">ログインせずに練習する →</Link></div>
        <AuthButtons />
      </div>
    </main>
  );
}
