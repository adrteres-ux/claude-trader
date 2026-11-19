"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions";

const input = "mt-1 w-full rounded-md border border-line bg-surface-2 px-3 py-2";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="max-w-sm space-y-3 text-sm">
      <label className="block">
        <span className="text-ink-2">Contraseña actual</span>
        <input name="current" type="password" required autoComplete="current-password" className={input} />
      </label>
      <label className="block">
        <span className="text-ink-2">Contraseña nueva (mínimo 10 caracteres)</span>
        <input name="next" type="password" required minLength={10} autoComplete="new-password" className={input} />
      </label>
      <label className="block">
        <span className="text-ink-2">Repite la contraseña nueva</span>
        <input name="repeat" type="password" required minLength={10} autoComplete="new-password" className={input} />
      </label>
      {state && <p className={state.ok ? "text-good" : "text-bad"}>{state.msg}</p>}
      <button disabled={pending} className="rounded-md bg-accent px-3 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
