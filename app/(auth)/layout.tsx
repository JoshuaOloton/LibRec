export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-md py-4 sm:py-10">{children}</main>;
}
