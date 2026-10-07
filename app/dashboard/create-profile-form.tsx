"use client";

import { useActionState } from "react";
import { createProfile, type CreateProfileState } from "./actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";

export function CreateProfileForm() {
  const [state, action, pending] = useActionState<CreateProfileState, FormData>(createProfile, {});
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
      <label className="text-sm font-medium text-slate-700">
        Slug
        <input name="slug" required placeholder="juan-perez" pattern="[a-z0-9-]+" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Nombre
        <input name="name" required placeholder="Juan Pérez" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Email del dueño <span className="font-normal text-slate-400">(opcional)</span>
        <input name="ownerEmail" type="email" placeholder="cliente@correo.com" className={inputClass} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
      >
        {pending ? "Creando…" : "Crear perfil"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 md:col-span-4">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
