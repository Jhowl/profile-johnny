import 'dotenv/config';

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: num(process.env.PORT, 3000),
  ollamaUrl: (process.env.OLLAMA_URL || 'http://192.168.1.182:11434').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma4:12b',
  adminToken: process.env.ADMIN_TOKEN || '',
  softLimit: num(process.env.SOFT_LIMIT, 8),
  maxMsgLen: num(process.env.MAX_MSG_LEN, 2000),
  historyTurns: num(process.env.HISTORY_TURNS, 12),
  rateWindowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
  rateMax: num(process.env.RATE_LIMIT_MAX, 40),
  dbPath: process.env.DB_PATH || '/app/data/chat.db',
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
};
