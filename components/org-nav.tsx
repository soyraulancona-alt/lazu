"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function OrgNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto text-sm">
      {items.map((item, i) => {
        // El primer elemento (resumen) solo se marca en su ruta exacta o en el detalle de perfil.
        const active =
          i === 0
            ? pathname === item.href || pathname.startsWith(`${item.href}/profiles/`)
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 ${
              active ? "border-orange font-semibold text-navy" : "border-transparent text-slate-500 hover:text-navy"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
