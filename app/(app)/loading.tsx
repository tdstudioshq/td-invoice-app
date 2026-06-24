// Shown while any (app) route's data is loading.
function Block({ className = "" }: { className?: string }) {
  return <div className={`bg-muted animate-pulse ${className}`} />;
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      {/* Header */}
      <div className="mb-6 space-y-2">
        <Block className="h-6 w-40" />
        <Block className="h-4 w-64" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Block key={i} className="h-28 w-full" />
        ))}
      </div>

      {/* Table-ish area */}
      <div className="border-border mt-8 space-y-3 border p-4">
        <Block className="h-5 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Block key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
