import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-metal-platinum md:text-xl">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground text-base leading-relaxed md:text-sm">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
