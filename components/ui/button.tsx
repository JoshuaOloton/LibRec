import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary: "bg-shelf text-surface hover:bg-shelf-deep",
  secondary: "border border-rule bg-transparent text-ink hover:bg-surface",
  danger: "bg-danger text-surface hover:opacity-90",
};

/** Class string for styling a <Link> or <a> as a button. */
export function buttonClasses(variant: Variant = "primary", className?: string) {
  return cn(base, variants[variant], className);
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant }) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}
