import Database from 'better-sqlite3';
import fs from 'node:fs'; import path from 'node:path';

let db: Database.Database | null = null;
export function init(dbPath = 'data/sessions.db') {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, provider TEXT, model_id TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
}
function requireDb(){ if(!db) throw new Error('DB not initialized'); return db!; }
export function setSessionProvider(sessionId: string, provider: string | null, modelId?: string | null) {
  const d=requireDb();
  d.prepare(`INSERT INTO sessions(session_id,provider,model_id) VALUES(?,?,?) ON CONFLICT(session_id) DO UPDATE SET provider=excluded.provider, model_id=excluded.model_id, updated_at=CURRENT_TIMESTAMP`).run(sessionId, provider, modelId ?? null);
}
export function getSessionProvider(sessionId: string): {provider: string|null, model_id: string|null} {
  const d=requireDb();
  return d.prepare('SELECT provider, model_id FROM sessions WHERE session_id=?').get(sessionId) ?? {provider:null, model_id:null};
}