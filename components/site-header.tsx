import Link from "next/link";
import { auth, signOut } from "@/auth";
import { MobileMenu } from "@/components/mobile-menu";
import { SearchForm } from "@/components/search-form";
import { buttonClasses } from "@/components/ui/button";

const navLink = "inline-flex min-h-11 items-center font-bold hover:underline";

async function logoutAction() {
  "use server";
  await signOut({ redirectTo: "/catalogue" });
}

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  const links = (
    <>
      <Link href="/catalogue" className={navLink}>
        Catalogue
      </Link>
      {user && (
        <Link href="/recommendations" className={navLink}>
          Your shelf
        </Link>
      )}
      {user?.role === "ADMIN" && (
        <Link href="/admin" className={navLink}>
          Admin
        </Link>
      )}
    </>
  );

  const account = user ? (
    <form action={logoutAction} className="flex items-center gap-3">
      <span className="max-w-40 truncate text-sm text-ink-muted" title={user.email ?? undefined}>
        {user.name}
      </span>
      <button type="submit" className={buttonClasses("secondary")}>
        Log out
      </button>
    </form>
  ) : (
    <div className="flex items-center gap-2">
      <Link href="/login" className={buttonClasses("secondary")}>
        Log in
      </Link>
      <Link href="/register" className={buttonClasses("primary")}>
        Create account
      </Link>
    </div>
  );

  return (
    <header className="relative border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-page items-center gap-4 px-4 py-3">
        <Link href="/catalogue" className="font-serif text-xl font-semibold text-shelf">
          LibRec
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-5 md:flex">
          {links}
        </nav>

        <div className="ml-auto hidden w-full max-w-sm md:block">
          <SearchForm id="search-desktop" />
        </div>
        <div className="hidden md:block">{account}</div>

        <div className="ml-auto md:hidden">
          <MobileMenu>
            <SearchForm id="search-mobile" />
            <nav aria-label="Main" className="flex flex-col">
              {links}
            </nav>
            {account}
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}
