import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "../login/actions";

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-white/80 sm:inline">
        {user.name}
        {user.role === "ADMIN" ? (
          <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            admin
          </span>
        ) : null}
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-lg border border-white/20 px-3 py-1.5 text-white/90 transition hover:bg-white/10"
        >
          Salir
        </button>
      </form>
    </div>
  );
}

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="bg-navy text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-xl">
              <Logo />
            </Link>
            <nav className="text-sm">
              <Link href="/dashboard" className="text-white/80 hover:text-white">
                Resumen
              </Link>
            </nav>
          </div>
          <Suspense fallback={<div className="h-8 w-24" />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
