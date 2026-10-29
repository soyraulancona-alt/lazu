import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-navy">No encontramos esta página</h1>
      <p className="mt-1 text-sm text-slate-500">No existe o tu cuenta no tiene acceso a ella.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-orange-600 hover:underline">
        Volver al panel
      </Link>
    </div>
  );
}
