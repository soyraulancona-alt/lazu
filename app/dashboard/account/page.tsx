import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, inputClass, labelClass } from "@/components/action-form";
import { Card } from "@/components/card";
import { requireUser } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { changePassword } from "../actions";

export const metadata: Metadata = { title: "Mi cuenta" };

export default function AccountPage() {
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold text-navy">Mi cuenta</h1>
      <Suspense fallback={null}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  const user = await requireUser();
  return (
    <Card title="Cambiar contraseña" description={`${user.name} · ${user.email}`}>
      <ActionForm action={changePassword} submitLabel="Cambiar contraseña" className="space-y-4">
        <label className={labelClass}>
          Contraseña actual
          <input name="current" type="password" autoComplete="current-password" required className={inputClass} />
        </label>
        <label className={labelClass}>
          Nueva contraseña <span className="font-normal text-slate-400">(mínimo {MIN_PASSWORD_LENGTH} caracteres)</span>
          <input name="next" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className={inputClass} />
        </label>
        <label className={labelClass}>
          Repite la nueva contraseña
          <input name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
        </label>
      </ActionForm>
    </Card>
  );
}
