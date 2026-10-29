import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-navy px-4 text-center text-white">
      <div>
        <Logo className="text-4xl" />
        <p className="mt-4 text-white/80">No encontramos esta página.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-orange hover:underline">
          Ir al panel
        </Link>
      </div>
    </main>
  );
}
