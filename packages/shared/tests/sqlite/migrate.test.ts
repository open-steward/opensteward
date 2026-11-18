import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { applyMigrations, type Migration } from '../../src/sqlite/migrate'

function trackerVersion(db: Database.Database, namespace: string): number {
  const row = db
    .prepare(`SELECT MAX(version) AS v FROM _schema_migrations WHERE namespace = ?`)
    .get(namespace) as { v: number | null }
  return row.v ?? 0
}

describe('applyMigrations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })
  afterEach(() => {
    db.close()
  })

  it('runs every migration against a fresh database', () => {
    const migrations: Migration[] = [
      { version: 1, sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY)' },
      { version: 2, sql: 'ALTER TABLE t ADD COLUMN name TEXT' },
    ]
    const report = applyMigrations(db, 'thing', migrations)
    expect(report).toEqual({ fromVersion: 0, toVersion: 2, applied: [1, 2] })
    expect(trackerVersion(db, 'thing')).toBe(2)
    expect(() => db.exec("INSERT INTO t (id, name) VALUES (1, 'x')")).not.toThrow()
  })

  it('is a no-op on a namespace already at the latest version', () => {
    const migrations: Migration[] = [
      { version: 1, sql: 'CREATE TABLE t (id INTEGER)' },
    ]
    applyMigrations(db, 'thing', migrations)
    const report = applyMigrations(db, 'thing', migrations)
    expect(report).toEqual({ fromVersion: 1, toVersion: 1, applied: [] })
  })

  it('tracks namespaces independently within the same database', () => {
    // The bug this entire helper exists to prevent: two stores sharing one
    // file would clobber each other if we used PRAGMA user_version.
    applyMigrations(db, 'alpha', [{ version: 1, sql: 'CREATE TABLE a (id INTEGER)' }])
    applyMigrations(db, 'beta', [{ version: 1, sql: 'CREATE TABLE b (id INTEGER)' }])
    expect(trackerVersion(db, 'alpha')).toBe(1)
    expect(trackerVersion(db, 'beta')).toBe(1)
    // Both tables exist.
    expect(() => db.exec("INSERT INTO a (id) VALUES (1)")).not.toThrow()
    expect(() => db.exec("INSERT INTO b (id) VALUES (1)")).not.toThrow()
  })

  it('only applies migrations newer than the current namespace version', () => {
    applyMigrations(db, 'thing', [{ version: 1, sql: 'CREATE TABLE t (id INTEGER)' }])
    const report = applyMigrations(db, 'thing', [
      { version: 1, sql: 'CREATE TABLE t (id INTEGER)' },
      { version: 2, sql: 'ALTER TABLE t ADD COLUMN x INTEGER' },
    ])
    expect(report).toEqual({ fromVersion: 1, toVersion: 2, applied: [2] })
  })

  it('rolls back when a migration throws and leaves the namespace unchanged', () => {
    applyMigrations(db, 'thing', [{ version: 1, sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY)' }])
    expect(() =>
      applyMigrations(db, 'thing', [
        { version: 1, sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY)' },
        { version: 2, sql: 'CREATE TABLE t (id INTEGER)' },
      ]),
    ).toThrow()
    expect(trackerVersion(db, 'thing')).toBe(1)
  })

  it('rejects gaps in version numbers', () => {
    expect(() =>
      applyMigrations(db, 'thing', [
        { version: 1, sql: 'CREATE TABLE a (id INTEGER)' },
        { version: 3, sql: 'CREATE TABLE c (id INTEGER)' },
      ]),
    ).toThrow(/contiguous 1-based/)
  })

  it('rejects out-of-order versions', () => {
    expect(() =>
      applyMigrations(db, 'thing', [
        { version: 2, sql: 'CREATE TABLE b (id INTEGER)' },
        { version: 1, sql: 'CREATE TABLE a (id INTEGER)' },
      ]),
    ).toThrow(/contiguous 1-based/)
  })

  it('refuses to run when the namespace is at a higher version than the binary', () => {
    applyMigrations(db, 'thing', [
      { version: 1, sql: 'CREATE TABLE t (id INTEGER)' },
      { version: 2, sql: 'ALTER TABLE t ADD COLUMN x INTEGER' },
    ])
    expect(() =>
      applyMigrations(db, 'thing', [{ version: 1, sql: 'CREATE TABLE t (id INTEGER)' }]),
    ).toThrow(/newer schema/)
  })

  it('rejects empty or malformed namespaces', () => {
    expect(() => applyMigrations(db, '', [])).toThrow(/identifier/)
    expect(() => applyMigrations(db, '1bad', [])).toThrow(/identifier/)
    expect(() => applyMigrations(db, 'with spaces', [])).toThrow(/identifier/)
  })

  it('invokes onApplied once per applied migration with version + duration', () => {
    const calls: Array<{ version: number; durationMs: number }> = []
    const migrations: Migration[] = [
      { version: 1, sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY)' },
      { version: 2, sql: 'ALTER TABLE t ADD COLUMN name TEXT' },
      { version: 3, sql: 'CREATE INDEX idx_t_name ON t(name)' },
    ]
    applyMigrations(db, 'thing', migrations, {
      onApplied: (version, durationMs) => calls.push({ version, durationMs }),
    })
    expect(calls.map((c) => c.version)).toEqual([1, 2, 3])
    // Durations are non-negative integers measured in ms. We can't assert
    // an upper bound — a slow CI box could legitimately take >0ms per
    // migration — but a negative or NaN value would mean we're computing
    // it wrong.
    for (const c of calls) {
      expect(Number.isFinite(c.durationMs)).toBe(true)
      expect(c.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('does not invoke onApplied for migrations that are already applied', () => {
    const migrations: Migration[] = [
      { version: 1, sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY)' },
    ]
    applyMigrations(db, 'thing', migrations)
    const calls: number[] = []
    applyMigrations(db, 'thing', migrations, {
      onApplied: (version) => calls.push(version),
    })
    expect(calls).toEqual([])
  })

  it('swallows onApplied errors so a failing audit write cannot break boot', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() =>
      applyMigrations(db, 'thing', [
        { version: 1, sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY)' },
      ], {
        onApplied: () => {
          throw new Error('audit-log write failed')
        },
      }),
    ).not.toThrow()
    expect(trackerVersion(db, 'thing')).toBe(1)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
    logSpy.mockRestore()
  })

  it('logs one [migrate:<namespace>] line per applied version', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    applyMigrations(db, 'thing', [
      { version: 1, sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY)' },
      { version: 2, sql: 'ALTER TABLE t ADD COLUMN name TEXT' },
    ])
    const lines = logSpy.mock.calls.map((c) => String(c[0]))
    expect(lines.some((l) => l.startsWith('[migrate:thing] applied version 1'))).toBe(true)
    expect(lines.some((l) => l.startsWith('[migrate:thing] applied version 2'))).toBe(true)
    logSpy.mockRestore()
  })

  it('supports multi-statement migrations', () => {
    const sql = `
      CREATE TABLE a (id INTEGER PRIMARY KEY);
      CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id));
      CREATE INDEX idx_b_a ON b(a_id);
    `
    applyMigrations(db, 'thing', [{ version: 1, sql }])
    expect(trackerVersion(db, 'thing')).toBe(1)
    expect(() => db.exec("INSERT INTO a (id) VALUES (1)")).not.toThrow()
    expect(() => db.exec("INSERT INTO b (id, a_id) VALUES (1, 1)")).not.toThrow()
  })
})
