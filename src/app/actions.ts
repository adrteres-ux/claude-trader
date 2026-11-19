"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { EXP_COOKIE } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

/** Dominio interno: el usuario "adria" se guarda en Supabase como adria@mi-cartera.local. */
const LOGIN_DOMAIN = "mi-cartera.local";
const toEmail = (user: string) => (user.includes("@") ? user : `${user}@${LOGIN_DOMAIN}`);

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const user = String(form.get("user") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: toEmail(user), password });
  if (error) return "Usuario o contraseña incorrectos.";
  redirect("/mi-cartera");
}

export async function changePassword(_prev: { ok: boolean; msg: string } | null, form: FormData): Promise<{ ok: boolean; msg: string }> {
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const repeat = String(form.get("repeat") ?? "");
  if (next.length < 10) return { ok: false, msg: "La contraseña nueva debe tener al menos 10 caracteres." };
  if (next !== repeat) return { ok: false, msg: "Las dos contraseñas nuevas no coinciden." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return { ok: false, msg: "La sesión ha caducado: vuelve a entrar." };
  // Se comprueba la contraseña actual antes de cambiarla.
  const check = await supabase.auth.signInWithPassword({ email: data.user.email, password: current });
  if (check.error) return { ok: false, msg: "La contraseña actual no es correcta." };
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, msg: `No se pudo cambiar: ${error.message}` };
  return { ok: true, msg: "Contraseña cambiada." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function selectExperiment(code: string) {
  (await cookies()).set(EXP_COOKIE, code, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
