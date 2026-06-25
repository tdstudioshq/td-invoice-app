// Shown while any /portal route's data is loading.
function Block({ className = "" }: { className?: string }) {
  return <div className={`bg-muted animate-pulse ${className}`} />;
}

export default function PortalLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 space-y-2">
        <Block className="h-6 w-44" />
        <Block className="h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Block key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
