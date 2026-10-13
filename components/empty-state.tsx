import { cn } from "@/lib/utils";

/** Empty states give direction: say what is missing and what to do next. */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-prose border-l-[3px] border-rule py-2 pl-4", className)}>
      <h2 className="text-xl">{title}</h2>
      {children && <p className="mt-1 text-ink-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
