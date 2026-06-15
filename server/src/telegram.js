import { config } from './config.js';

// Escape for Telegram HTML parse_mode.
const esc = (s) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

let warned = false;

/**
 * Send a Telegram notification for a new contact/lead.
 * No-op (with a one-time warning) if the bot token / chat id are not configured.
 * Fire-and-forget: never throws — a failed notification must not break the form.
 */
export async function notifyLead(lead) {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) {
    if (!warned) {
      console.warn('[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — notifications disabled.');
      warned = true;
    }
    return;
  }

  const label = lead.source === 'contact-form' ? 'contact form' : 'chat';
  const lines = [
    `🟠 <b>New ${esc(label)} message — johnnycosta.dev</b>`,
    '',
    `👤 <b>Name:</b> ${esc(lead.name) || '—'}`,
    `📧 <b>Email:</b> ${esc(lead.email)}`,
  ];
  if (lead.message) lines.push('', '💬 <b>Message:</b>', esc(lead.message));
  if (lead.sessionId) lines.push('', `🧵 <code>${esc(lead.sessionId)}</code>`);

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[telegram] sendMessage failed ${res.status}: ${detail.slice(0, 200)}`);
    }
  } catch (err) {
    console.error('[telegram] error:', err.message);
  }
}
