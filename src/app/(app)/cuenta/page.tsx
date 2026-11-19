import { createClient } from "@/lib/supabase/server";
import { Section } from "@/components/ui";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default async function CuentaPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user?.email?.replace(/@mi-cartera\.local$/, "") ?? "—";
  return (
    <div className="space-y-4">
      <Section title="Tu cuenta">
        <p className="text-sm text-ink-2">
          Usuario: <strong className="text-ink">{user}</strong>
        </p>
        <p className="mt-1 text-xs text-muted">Para cambiar el nombre de usuario, edítalo en Supabase (Authentication → Users).</p>
      </Section>
      <Section title="Cambiar contraseña">
        <ChangePasswordForm />
      </Section>
    </div>
  );
}
