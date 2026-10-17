import { InfoIcon } from "./icons";

/** Animated three-dot progress line, as in the mockup's "Ask: searching" state. */
export function Progress({ steps, label = "Searching Notion" }: { steps: string[]; label?: string }) {
  const current = steps[steps.length - 1] ?? label;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center gap-2.5 text-sm text-ink-muted">
        <span className="flex gap-1">
          <span className="dot h-1.5 w-1.5 rounded-full bg-brand" />
          <span className="dot h-1.5 w-1.5 rounded-full bg-brand" />
          <span className="dot h-1.5 w-1.5 rounded-full bg-brand" />
        </span>
        {current}
      </div>
      {steps.length > 1 && (
        <ol className="m-0 flex list-none flex-col gap-1 p-0 pl-[34px] text-xs leading-4 text-ink-muted opacity-70">
          {steps.slice(0, -1).map((s, i) => (
            <li key={i}>✓ {s}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Shown whenever a lookup fails because the Notion sign-in stopped working. */
export function NotionDown() {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber bg-amber-tint px-4 py-3.5">
      <InfoIcon size={18} stroke="var(--amber)" className="mt-1 flex-none" />
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-ink">The Notion connection is down.</span>
        <span className="text-[15px] text-ink-soft">
          Text Tom so he can reconnect it (the button below needs his Notion account). Until then, use the backup
          Claude Project.
        </span>
        <a
          href="/api/connect/notion/start"
          className="btn-primary mt-2 inline-flex h-10 items-center self-start rounded-lg bg-brand px-4 text-sm font-semibold text-white no-underline"
        >
          Connect Notion
        </a>
      </div>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-amber bg-amber-tint px-4 py-3.5">
      <span className="flex-1 text-[15px] text-ink-soft">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="h-9 rounded-lg border border-line-strong bg-transparent px-3.5 text-sm font-semibold text-ink"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

export function NotInNotion({ title = "That isn't in Notion.", detail }: { title?: string; detail?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-line-strong bg-raised px-3.5 py-3">
      <InfoIcon size={18} stroke="var(--ink-muted)" className="mt-[3px] flex-none" />
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-ink">{title}</span>
        {detail && <span className="text-sm leading-5 text-ink-muted">{detail}</span>}
      </div>
    </div>
  );
}
