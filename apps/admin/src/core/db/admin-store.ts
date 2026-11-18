import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { randomUUID } from 'crypto'

export interface UserRow {
  id: string
  username: string
  password_hash: string
  role: 'admin' | 'operator' | 'viewer'
  created_at: number
  updated_at: number
}

export interface AuditEntry {
  id: number
  user_id: string
  action: string
  vertical: string | null
  target_id: string | null
  detail: string | null
  created_at: number
}

export interface NotificationRow {
  id: number
  type: string
  vertical: string | null
  connection_id: string | null
  platform: string | null
  message: string
  acknowledged: number
  created_at: number
}

export class AdminStore {
  private db: Database.Database

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        vertical TEXT,
        target_id TEXT,
        detail TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        vertical TEXT,
        connection_id TEXT,
        platform TEXT,
        message TEXT NOT NULL,
        acknowledged INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `)
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  createUser(username: string, passwordHash: string, role: 'admin' | 'operator' | 'viewer'): UserRow {
    const id = randomUUID()
    const now = Date.now()
    this.db
      .prepare('INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, username, passwordHash, role, now, now)
    return this.getUserById(id)!
  }

  getUserByUsername(username: string): UserRow | null {
    return (this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow) ?? null
  }

  getUserById(id: string): UserRow | null {
    return (this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow) ?? null
  }

  listUsers(): UserRow[] {
    return this.db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as UserRow[]
  }

  deleteUser(id: string): boolean {
    return this.db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0
  }

  hasUsers(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }
    return row.count > 0
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  writeAudit(userId: string, action: string, vertical?: string, targetId?: string, detail?: Record<string, unknown>): void {
    this.db
      .prepare('INSERT INTO audit_log (user_id, action, vertical, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, action, vertical ?? null, targetId ?? null, detail ? JSON.stringify(detail) : null, Date.now())
  }

  listAudit(limit = 100, offset = 0): AuditEntry[] {
    return this.db
      .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as AuditEntry[]
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  createNotification(type: string, message: string, vertical?: string, connectionId?: string, platform?: string): void {
    this.db
      .prepare('INSERT INTO notifications (type, vertical, connection_id, platform, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(type, vertical ?? null, connectionId ?? null, platform ?? null, message, Date.now())
  }

  listUnacknowledged(limit = 50): NotificationRow[] {
    return this.db
      .prepare('SELECT * FROM notifications WHERE acknowledged = 0 ORDER BY created_at DESC LIMIT ?')
      .all(limit) as NotificationRow[]
  }

  acknowledgeNotification(id: number): boolean {
    return this.db.prepare('UPDATE notifications SET acknowledged = 1 WHERE id = ?').run(id).changes > 0
  }

  acknowledgeAll(): void {
    this.db.exec('UPDATE notifications SET acknowledged = 1 WHERE acknowledged = 0')
  }

  close(): void {
    this.db.close()
  }
}
