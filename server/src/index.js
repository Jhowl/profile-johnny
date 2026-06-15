import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { dbApi } from './db.js';
import { streamChat } from './ollama.js';
import { SYSTEM_PROMPT } from './prompt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Behind nginx — trust the first proxy hop so rate limiting sees the real client IP.
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const clean = (s, max = 200) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

// ---- Rate limiting (per IP) on the public write endpoints ----
const limiter = rateLimit({
  windowMs: config.rateWindowMs,
  max: config.rateMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down or email contact@johnnycosta.dev.' },
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---- Chat (streamed) ----
app.post('/api/chat', limiter, async (req, res) => {
  const sessionId = clean(req.body?.sessionId, 64);
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!sessionId || !/^[A-Za-z0-9_-]{6,64}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session.' });
  }
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  if (message.length > config.maxMsgLen) {
    return res.status(400).json({ error: `Message too long (max ${config.maxMsgLen} chars).` });
  }

  const ip = req.ip;
  const userAgent = clean(req.get('user-agent'), 300);
  dbApi.upsertSession(sessionId, ip, userAgent);
  dbApi.addMessage(sessionId, 'user', message);

  // Build context: system prompt + recent history (already includes this user message).
  const history = dbApi.getRecentMessages(sessionId, config.historyTurns * 2);
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];

  const userCount = dbApi.countUserMessages(sessionId);
  const promptContact = !dbApi.isLeadCaptured(sessionId) && userCount >= config.softLimit;

  // Stream tokens as chunked plain text; a final JSON metadata frame follows a NUL separator.
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  // Cancel the Ollama generation if the visitor disconnects mid-stream.
  const ac = new AbortController();
  req.on('close', () => ac.abort());

  let assistant = '';
  try {
    assistant = await streamChat(messages, (token) => res.write(token), ac.signal);
  } catch (err) {
    console.error('[chat] Ollama error:', err.message);
    if (!res.headersSent) {
      return res.status(502).json({ error: 'AI is offline right now.' });
    }
    // Already streaming — append a readable error and stop.
    res.write('\n\n[The assistant is unavailable right now. Please email contact@johnnycosta.dev.]');
    return res.end();
  }

  if (assistant.trim()) dbApi.addMessage(sessionId, 'assistant', assistant);

  // Trailing metadata frame: NUL byte then JSON. Client splits on the NUL.
  res.write('\0' + JSON.stringify({ promptContact }));
  res.end();
});

// ---- Lead capture (also used by the site contact form) ----
app.post('/api/lead', limiter, (req, res) => {
  const name = clean(req.body?.name, 120);
  const email = clean(req.body?.email, 200);
  const message = clean(req.body?.message, 2000);
  const sessionId = clean(req.body?.sessionId, 64) || null;
  const source = clean(req.body?.source, 40) || 'unknown';

  if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });

  dbApi.addLead({ sessionId, name, email, message, source });
  res.json({ ok: true });
});

// ---- Admin (token protected) ----
function requireAdmin(req, res, next) {
  const provided =
    req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.query.token || '';
  if (!config.adminToken || provided !== config.adminToken) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

app.get('/api/admin/leads', requireAdmin, (_req, res) => {
  res.json({ leads: dbApi.getLeads() });
});
app.get('/api/admin/conversations', requireAdmin, (_req, res) => {
  res.json({ conversations: dbApi.getConversations() });
});

// Simple admin page (token entered in the browser, calls the endpoints above).
app.use('/api/admin', express.static(join(__dirname, '..', 'public')));

app.listen(config.port, () => {
  console.log(`[api] listening on :${config.port}`);
  console.log(`[api] ollama: ${config.ollamaUrl} model: ${config.ollamaModel}`);
  if (!config.adminToken) console.warn('[api] WARNING: ADMIN_TOKEN is empty — admin endpoints are locked.');
});
