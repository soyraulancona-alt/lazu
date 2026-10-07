import Link from "next/link";

export default function ProfileNotFound() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold text-navy">Perfil no encontrado</h1>
      <p className="mt-1 text-sm text-slate-500">No existe o no tienes acceso a él.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-orange-600">
        Volver al resumen
      </Link>
    </div>
  );
}
