import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

// Ensure the directory for the SQLite file exists (e.g. mounted /app/data volume).
const dir = dirname(config.dbPath);
if (dir && dir !== '.' && !existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    ip TEXT,
    user_agent TEXT,
    lead_captured INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    name TEXT,
    email TEXT,
    message TEXT,
    source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
`);

const stmts = {
  upsertSession: db.prepare(
    `INSERT INTO sessions (id, ip, user_agent) VALUES (@id, @ip, @user_agent)
     ON CONFLICT(id) DO NOTHING`
  ),
  insertMessage: db.prepare(
    `INSERT INTO messages (session_id, role, content) VALUES (@session_id, @role, @content)`
  ),
  recentMessages: db.prepare(
    `SELECT role, content FROM messages WHERE session_id = ?
     ORDER BY id DESC LIMIT ?`
  ),
  countUserMessages: db.prepare(
    `SELECT COUNT(*) AS c FROM messages WHERE session_id = ? AND role = 'user'`
  ),
  isLeadCaptured: db.prepare(`SELECT lead_captured FROM sessions WHERE id = ?`),
  markLeadCaptured: db.prepare(`UPDATE sessions SET lead_captured = 1 WHERE id = ?`),
  insertLead: db.prepare(
    `INSERT INTO leads (session_id, name, email, message, source)
     VALUES (@session_id, @name, @email, @message, @source)`
  ),
  allLeads: db.prepare(`SELECT * FROM leads ORDER BY id DESC LIMIT ?`),
  allSessions: db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?`),
  sessionMessages: db.prepare(
    `SELECT role, content, created_at FROM messages WHERE session_id = ? ORDER BY id ASC`
  ),
};

export const dbApi = {
  upsertSession(id, ip, userAgent) {
    stmts.upsertSession.run({ id, ip, user_agent: userAgent });
  },
  addMessage(sessionId, role, content) {
    stmts.insertMessage.run({ session_id: sessionId, role, content });
  },
  // Returns messages oldest-first, capped to the last `limit` rows.
  getRecentMessages(sessionId, limit) {
    const rows = stmts.recentMessages.all(sessionId, limit);
    return rows.reverse();
  },
  countUserMessages(sessionId) {
    return stmts.countUserMessages.get(sessionId).c;
  },
  isLeadCaptured(sessionId) {
    const row = stmts.isLeadCaptured.get(sessionId);
    return row ? row.lead_captured === 1 : false;
  },
  addLead(lead) {
    stmts.insertLead.run({
      session_id: lead.sessionId ?? null,
      name: lead.name ?? null,
      email: lead.email ?? null,
      message: lead.message ?? null,
      source: lead.source ?? null,
    });
    if (lead.sessionId) stmts.markLeadCaptured.run(lead.sessionId);
  },
  getLeads(limit = 500) {
    return stmts.allLeads.all(limit);
  },
  getConversations(limit = 200) {
    const sessions = stmts.allSessions.all(limit);
    return sessions.map((s) => ({
      ...s,
      messages: stmts.sessionMessages.all(s.id),
    }));
  },
};

export default db;
