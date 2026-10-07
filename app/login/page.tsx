import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Acceso" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center text-white">
          <Logo className="text-4xl" />
          <p className="mt-2 text-sm text-white/70">Estadísticas de tus perfiles digitales</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="mb-5 text-lg font-semibold text-navy">Iniciar sesión</h1>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
