export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-surface-subtle">
      <div className="max-w-md w-full p-8 bg-surface rounded-md border border-border shadow-sm">
        <div className="space-y-4">
          <div className="border-b border-border pb-4">
            <h1 className="text-xl font-semibold text-text-primary tracking-tight">
              Operations Operating System (OOS)
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Phase 0 — Engineering Foundation
            </p>
          </div>

          <div className="flex items-center space-x-2 py-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-status-success"></span>
            <span className="text-sm font-medium text-status-success">
              Foundation Verified
            </span>
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-xs text-text-muted leading-relaxed">
              Authoritative Product Vision and V1 PRD documents required before
              business feature implementation.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
