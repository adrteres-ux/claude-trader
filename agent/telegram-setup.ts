// Ayuda para conectar tu bot de Telegram: `npm run telegram-setup`.
// 1. Crea el bot con @BotFather y pon el token en .env.local como TELEGRAM_BOT_TOKEN=...
// 2. Abre el chat con tu bot en Telegram y envíale cualquier mensaje (por ejemplo "hola").
// 3. Ejecuta este script: busca tu chat, lo guarda en .env.local como TELEGRAM_CHAT_ID y te envía un mensaje de prueba.
import fs from "node:fs";
import path from "node:path";
import { sendTelegram } from "./lib/telegram";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.log("Falta TELEGRAM_BOT_TOKEN en .env.local. Créalo con @BotFather y pégalo así:\nTELEGRAM_BOT_TOKEN=123456:ABC...");
  process.exit(1);
}
const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const j = (await res.json()) as { ok: boolean; description?: string; result?: { message?: { chat: { id: number; first_name?: string; type: string } } }[] };
if (!j.ok) {
  console.log(`Telegram no acepta el token: ${j.description}. Revisa que esté bien copiado.`);
  process.exit(1);
}
const chats = (j.result ?? []).map((u) => u.message?.chat).filter((c): c is { id: number; first_name?: string; type: string } => !!c && c.type === "private");
const chat = chats.at(-1);
if (!chat) {
  console.log("No encuentro tu chat. Abre tu bot en Telegram, envíale un mensaje (por ejemplo \"hola\") y vuelve a ejecutar: npm run telegram-setup");
  process.exit(1);
}
const envFile = path.resolve(process.cwd(), ".env.local");
let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
env = /^TELEGRAM_CHAT_ID=.*$/m.test(env) ? env.replace(/^TELEGRAM_CHAT_ID=.*$/m, `TELEGRAM_CHAT_ID=${chat.id}`) : `${env.replace(/\s*$/, "")}\nTELEGRAM_CHAT_ID=${chat.id}\n`;
fs.writeFileSync(envFile, env);
process.env.TELEGRAM_CHAT_ID = String(chat.id);
await sendTelegram(`✅ Conectado. A partir de ahora recibirás aquí el resumen de tu cartera cada día laborable a las 22:20.`);
console.log(`Listo: chat ${chat.id}${chat.first_name ? ` (${chat.first_name})` : ""} guardado en .env.local y mensaje de prueba enviado.`);
