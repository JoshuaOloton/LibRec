import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Literata } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: { default: "LibRec", template: "%s · LibRec" },
  description: "Book recommendations for the library, with a reason for every pick.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${literata.variable} ${atkinson.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <div className="mx-auto w-full max-w-page flex-1 px-4 py-6 sm:py-8">{children}</div>
        <footer className="border-t border-rule">
          <p className="mx-auto max-w-page px-4 py-6 text-sm text-ink-muted">
            LibRec is a prototype built for a Yaba College of Technology seminar project.
          </p>
        </footer>
      </body>
    </html>
  );
}
