import { cn } from "@/lib/utils";

export const inputClasses =
  "min-h-11 w-full rounded-md border border-rule bg-surface px-3 text-base text-ink placeholder:text-ink-muted";

export function Field({
  label,
  name,
  error,
  hint,
  className,
  ...props
}: React.ComponentProps<"input"> & { label: string; name: string; error?: string; hint?: string }) {
  const describedBy = [error && `${name}-error`, hint && `${name}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block font-bold">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(inputClasses, error && "border-danger", className)}
        {...props}
      />
      {hint && !error && (
        <p id={`${name}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
