import { PasscodeForm } from "@/components/PasscodeForm";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  return (
    <main className="gridbg flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border border-line bg-surface p-8 shadow-card">
        <div className="flex items-center gap-3">
          <span className="font-display text-[22px] font-extrabold tracking-[-0.5px]">GOAL</span>
          <span className="h-5 w-px bg-line-strong" />
          <span className="text-sm font-medium text-ink-muted">Account Lookup</span>
        </div>
        <p className="m-0 text-center text-sm text-ink-muted">Enter the passcode Tom gave you.</p>
        <PasscodeForm next={next} />
      </div>
    </main>
  );
}
