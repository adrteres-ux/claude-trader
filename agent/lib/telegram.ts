// Envío de mensajes por Telegram (Bot API, gratis). Necesita en .env.local:
//   TELEGRAM_BOT_TOKEN  (te lo da @BotFather)   TELEGRAM_CHAT_ID  (lo saca `npm run telegram-setup`)
// El token es secreto: solo en .env.local, nunca en el repo.

const MAX = 4000; // Telegram admite 4096 caracteres por mensaje

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function telegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
}

/** Parte un texto largo en trozos por saltos de línea, sin cortar etiquetas HTML de una línea. */
export function splitMessage(text: string, max = MAX): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur.length + line.length + 1 > max && cur) {
      out.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line;
  }
  if (cur) out.push(cur);
  return out;
}

export async function sendTelegram(html: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en .env.local (ejecuta npm run telegram-setup)");
  for (const part of splitMessage(html)) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: part, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!j?.ok) throw new Error(`Telegram respondió con error: ${j?.description ?? res.status}`);
  }
}

/** Envía una imagen PNG (el gráfico del día). Solo va a tu chat, igual que los mensajes. */
export async function sendTelegramPhoto(png: Buffer, caption?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en .env.local (ejecuta npm run telegram-setup)");
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "mi-cartera.png");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
  const j = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!j?.ok) throw new Error(`Telegram respondió con error al enviar el gráfico: ${j?.description ?? res.status}`);
}
