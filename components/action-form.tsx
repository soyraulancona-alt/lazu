"use client";

import { startTransition, useActionState } from "react";

export type ActionState = {
  error?: string;
  ok?: string;
  /** Dato que se muestra una sola vez (p. ej. contraseña temporal). */
  secret?: string;
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  variant?: "primary" | "secondary";
  /**
   * Formularios de edición: conservan lo que el usuario eligió después de guardar.
   * Sin esto, React reinicia el formulario a sus valores iniciales al terminar la acción
   * (lo correcto para formularios de alta).
   */
  keepValues?: boolean;
};

export const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";

export const labelClass = "block text-sm font-medium text-slate-700";

/** Formulario con server action, estado de envío y mensaje de resultado. */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  className = "",
  variant = "primary",
  keepValues = false,
}: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const buttonClass =
    variant === "primary"
      ? "rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
      : "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-navy transition hover:bg-slate-50 disabled:opacity-60";

  return (
    <form
      action={keepValues ? undefined : formAction}
      onSubmit={
        keepValues
          ? (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              startTransition(() => formAction(formData));
            }
          : undefined
      }
      className={className}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? (pendingLabel ?? "Guardando…") : submitLabel}
        </button>
        {state.error ? (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p role="status" className="text-sm text-emerald-700">
            {state.ok}
          </p>
        ) : null}
      </div>
      {state.secret ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Contraseña temporal (solo se muestra esta vez, compártela por un canal privado):{" "}
          <code className="select-all rounded bg-white px-1.5 py-0.5 font-mono">{state.secret}</code>
        </p>
      ) : null}
    </form>
  );
}
