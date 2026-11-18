/**
 * db-copy against a purpose-built schema whose DDL diverges between the
 * dialects everywhere the real schemas could: INTEGER ↔ BOOLEAN, BLOB ↔
 * BYTEA, TEXT ↔ JSONB, INTEGER ↔ BIGINT (a value above 2^53), REAL ↔ DOUBLE
 * PRECISION, AUTOINCREMENT ↔ GENERATED ALWAYS AS IDENTITY and BIGSERIAL, a
 * foreign key whose parent sorts after its child, and a seed row inserted by
 * a migration (like the 'default' tenant).
 *
 * SQLite → SQLite always runs; the Postgres directions run when
 * TEST_DATABASE_URL is set (`pnpm test:pg`), each in a throwaway database.
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, join } from 'path'
import type { DbHandle, DualMigration } from '../../src/db'
import {
  copyDatabase,
  DbCopyError,
  foreignKeyOrder,
  recordProfile,
  runDbCopyCli,
  type CopyReport,
  type DbCopyProfile,
} from '../../src/db-copy'
import { DIRECTIONS, PG_BASE, exec, makeSide, query, removeTmpRoot, type Side } from './helpers'

const KITCHEN: DualMigration[] = [
  {
    version: 1,
    sqlite: `
      CREATE TABLE parents (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE children (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id  TEXT NOT NULL REFERENCES parents(id),
        flag       INTEGER NOT NULL,
        payload    BLOB,
        big        INTEGER,
        doc        TEXT,
        amount     REAL,
        note       TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL);
      INSERT INTO parents (id, name) VALUES ('seed', 'Seeded by the migration');
    `,
    postgres: `
      CREATE TABLE parents (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE children (
        id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        parent_id  TEXT NOT NULL REFERENCES parents(id),
        flag       BOOLEAN NOT NULL,
        payload    BYTEA,
        big        BIGINT,
        doc        JSONB,
        amount     DOUBLE PRECISION,
        note       TEXT,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE events (id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL);
      INSERT INTO parents (id, name) VALUES ('seed', 'Seeded by the migration') ON CONFLICT DO NOTHING;
    `,
  },
  {
    version: 2,
    sqlite: `ALTER TABLE children ADD COLUMN extra TEXT;`,
    postgres: `ALTER TABLE children ADD COLUMN extra TEXT;`,
  },
]

function kitchen(migrations: DualMigration[] = KITCHEN): DbCopyProfile {
  return {
    name: 'kitchen',
    description: 'test schema covering every dialect divergence',
    open: async (h: DbHandle) => {
      await h.migrate('kitchen', migrations)
    },
  }
}

const SECRET_ROW_VALUE = 'SECRET-ROW-VALUE-never-printed'

function seedSql(side: Side): string {
  const pg = side.kind === 'postgres'
  const t = pg ? 'true' : '1'
  const f = pg ? 'false' : '0'
  const blob = pg ? `'\\x00ff10'::bytea` : `X'00FF10'`
  const ov = pg ? ' OVERRIDING SYSTEM VALUE' : ''
  return `
    INSERT INTO parents (id, name) VALUES ('p1', 'First'), ('p2', 'Second');
    INSERT INTO children (id, parent_id, flag, payload, big, doc, amount, note, created_at, extra)${ov} VALUES
      (1, 'p1', ${t}, ${blob}, 9007199254740993, '{"b":1,"a":[1,2]}', 12.5, '${SECRET_ROW_VALUE}', 1727600000000, NULL),
      (2, 'p2', ${f}, NULL, -42, NULL, NULL, NULL, 1727600000001, 'x'),
      (5, 'p1', ${t}, ${blob}, 0, '[]', 0.25, '', 1727600000002, NULL);
    INSERT INTO events (kind) VALUES ('a');
    INSERT INTO events (kind) VALUES ('b');
    INSERT INTO events (kind) VALUES ('c');
    INSERT INTO events (kind) VALUES ('d');
    DELETE FROM events WHERE kind = 'd';
  `
}

async function seededSource(side: Side, profile = kitchen()): Promise<void> {
  const h = await side.open()
  try {
    await profile.open(h)
    await h.execScript(seedSql(side))
  } finally {
    await h.close()
  }
}

async function prepared(side: Side, profile = kitchen()): Promise<void> {
  const h = await side.open()
  try {
    await profile.open(h)
  } finally {
    await h.close()
  }
}

const sides: Side[] = []
async function side(kind: Side['kind']): Promise<Side> {
  const s = await makeSide(kind)
  sides.push(s)
  return s
}
afterEach(async () => {
  while (sides.length) await sides.pop()!.cleanup()
})
afterAll(() => removeTmpRoot())

function capture(): { lines: string[]; log: (l: string) => void } {
  const lines: string[] = []
  return { lines, log: (l: string) => lines.push(l) }
}

async function expectCode(p: Promise<unknown>, code: string, exit: number): Promise<DbCopyError> {
  const err = await p.then(
    () => {
      throw new Error(`expected ${code}, but the copy succeeded`)
    },
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(DbCopyError)
  expect((err as DbCopyError).code).toBe(code)
  expect((err as DbCopyError).exitCode).toBe(exit)
  return err as DbCopyError
}

describe('recordProfile', () => {
  it('records namespaces, tables and the seed rows of a fresh database', async () => {
    const rec = await recordProfile(kitchen())
    expect(rec.namespaces.map((n) => [n.namespace, n.migrations.length])).toEqual([['kitchen', 2]])
    expect(rec.tables).toEqual(['children', 'events', 'parents'])
    expect(rec.seedCounts).toEqual({ children: 0, events: 0, parents: 1 })
  })
})

describe('foreignKeyOrder', () => {
  it('puts parents first, alphabetical otherwise', () => {
    const order = foreignKeyOrder(
      ['children', 'events', 'parents'],
      new Map([['children', ['parents']]]),
    )
    expect(order).toEqual(['events', 'parents', 'children'])
  })
})

describe.each(DIRECTIONS)('db-copy %s → %s', (fromKind, toKind) => {
  it('copies every row with dialect-correct values, ids and sequences', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)
    await seededSource(from)
    const { lines, log } = capture()

    const report = await copyDatabase({
      profile: kitchen(),
      from: from.endpoint,
      to: to.endpoint,
      log,
    })

    expect(report.tables.map((t) => [t.table, t.sourceRows, t.copied])).toEqual([
      ['events', 3, 3],
      ['parents', 3, 3],
      ['children', 3, 3],
    ])
    expect(report.namespaces).toEqual([
      { namespace: 'kitchen', expected: 2, source: 2, targetBefore: 0, targetAfter: 2 },
    ])

    const pg = toKind === 'postgres'
    const rows = await query<Record<string, unknown>>(
      to,
      pg
        ? `SELECT id::text AS id, parent_id, flag, payload, big::text AS big, doc::text AS doc,
                  amount, note, created_at::text AS created_at, extra FROM children ORDER BY id`
        : `SELECT CAST(id AS TEXT) AS id, parent_id, flag, payload, CAST(big AS TEXT) AS big,
                  typeof(big) AS big_type, doc, amount, note, CAST(created_at AS TEXT) AS created_at,
                  typeof(created_at) AS created_type, typeof(flag) AS flag_type, extra
           FROM children ORDER BY id`,
    )
    expect(rows.map((r) => r['id'])).toEqual(['1', '2', '5'])
    // Booleans: BOOLEAN on Postgres, INTEGER 0/1 on SQLite.
    expect(rows.map((r) => r['flag'])).toEqual(pg ? [true, false, true] : [1, 0, 1])
    if (!pg) expect(rows.every((r) => r['flag_type'] === 'integer')).toBe(true)
    // Blobs: identical bytes, NULL stays NULL.
    expect(Buffer.from(rows[0]!['payload'] as Buffer).equals(Buffer.from([0x00, 0xff, 0x10]))).toBe(
      true,
    )
    expect(rows[1]!['payload']).toBeNull()
    // A bigint above 2^53 survives exactly, and is stored as an integer.
    expect(rows.map((r) => r['big'])).toEqual(['9007199254740993', '-42', '0'])
    if (!pg) expect(rows.every((r) => r['big_type'] === 'integer')).toBe(true)
    // JSON: equal as JSON (JSONB normalises the text); NULL stays NULL.
    expect(JSON.parse(rows[0]!['doc'] as string)).toEqual({ b: 1, a: [1, 2] })
    expect(rows[1]!['doc']).toBeNull()
    expect(JSON.parse(rows[2]!['doc'] as string)).toEqual([])
    expect(rows.map((r) => r['amount'])).toEqual([12.5, null, 0.25])
    // Empty string and NULL stay distinct.
    expect(rows.map((r) => r['note'])).toEqual([SECRET_ROW_VALUE, null, ''])
    expect(rows.map((r) => r['created_at'])).toEqual([
      '1727600000000',
      '1727600000001',
      '1727600000002',
    ])
    if (!pg) expect(rows.every((r) => r['created_type'] === 'integer')).toBe(true)
    expect(rows.map((r) => r['extra'])).toEqual([null, 'x', null])

    if (fromKind === 'sqlite' && toKind === 'sqlite') {
      // AUTOINCREMENT high-water marks carry over exactly, and an empty
      // table gets no row (none was ever issued).
      const seq = `SELECT name, CAST(seq AS TEXT) AS seq FROM sqlite_sequence ORDER BY name`
      expect(await query(to, seq)).toEqual(await query(from, seq))
    }

    // Sequences: a new row gets a fresh id — past the copied ids (children,
    // explicit ids 1,2,5) and past the source's high-water mark (events: 4
    // was handed out, then deleted, so 4 must not be reused).
    const h = await to.open()
    try {
      await h.execScript(
        `INSERT INTO children (parent_id, flag, created_at) VALUES ('p2', ${pg ? 'true' : '1'}, 1);
         INSERT INTO events (kind) VALUES ('after-copy');`,
      )
    } finally {
      await h.close()
    }
    const newChild = await query<{ id: string }>(
      to,
      `SELECT CAST(id AS TEXT) AS id FROM children WHERE created_at = 1`,
    )
    expect(newChild.map((r) => r.id)).toEqual(['6'])
    const newEvent = await query<{ id: string }>(
      to,
      `SELECT CAST(id AS TEXT) AS id FROM events WHERE kind = 'after-copy'`,
    )
    expect(newEvent.map((r) => r.id)).toEqual(['5'])

    // The migration bookkeeping is the target's own, not a duplicate.
    const tracker = await query<{ n: unknown }>(
      to,
      `SELECT COUNT(*) AS n FROM _schema_migrations WHERE namespace = 'kitchen'`,
    )
    expect(Number(tracker[0]!.n)).toBe(2)

    // Never a row value or a credential in the output.
    const out = lines.join('\n')
    expect(out).not.toContain(SECRET_ROW_VALUE)
    for (const s of [from, to]) {
      if (s.endpoint.kind === 'postgres') {
        const u = new URL(s.endpoint.url)
        expect(out).not.toContain(`${u.username}:${u.password}@`)
      }
    }
  })

  it('--dry-run prints the row counts and writes nothing', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)
    await seededSource(from)
    const { lines, log } = capture()

    const report = await copyDatabase({
      profile: kitchen(),
      from: from.endpoint,
      to: to.endpoint,
      dryRun: true,
      log,
    })

    expect(report.dryRun).toBe(true)
    expect(report.tables.map((t) => [t.table, t.sourceRows, t.targetRowsBefore])).toEqual([
      ['children', 3, null],
      ['events', 3, null],
      ['parents', 3, null],
    ])
    const out = lines.join('\n')
    expect(out).toMatch(/children\s+3 rows/)
    expect(out).toMatch(/dry run OK: would copy 9 rows in 3 tables/)
    expect(out).not.toContain(SECRET_ROW_VALUE)
    if (toKind === 'sqlite') {
      expect(to.exists()).toBe(false)
    } else {
      const t = await query<{ t: string | null }>(to, `SELECT to_regclass('children')::text AS t`)
      expect(t[0]!.t).toBeNull()
    }
  })

  it('refuses a target that holds data unless --overwrite, then replaces it', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)
    await seededSource(from)
    const opts = { profile: kitchen(), from: from.endpoint, to: to.endpoint, log: () => {} }
    await copyDatabase(opts)
    await exec(to, `INSERT INTO parents (id, name) VALUES ('only-in-target', 'x')`)

    const refused = await expectCode(copyDatabase(opts), 'TARGET_NOT_EMPTY', 3)
    expect(refused.message).toContain('--overwrite')
    // The dry run refuses the same way.
    await expectCode(copyDatabase({ ...opts, dryRun: true }), 'TARGET_NOT_EMPTY', 3)
    expect(await query(to, `SELECT id FROM parents WHERE id = 'only-in-target'`)).toHaveLength(1)

    // A Postgres target's dump is covered below; no pg_dump on this machine.
    const report = await copyDatabase({
      ...opts,
      overwrite: true,
      ...(toKind === 'postgres' ? { backup: false } : {}),
    })
    expect(report.targetHadData).toBe(true)
    expect(await query(to, `SELECT id FROM parents WHERE id = 'only-in-target'`)).toHaveLength(0)
    const n = await query<{ n: unknown }>(to, `SELECT COUNT(*) AS n FROM children`)
    expect(Number(n[0]!.n)).toBe(3)
    if (toKind === 'sqlite') {
      // The replaced contents were snapshotted first, and still hold the stray row.
      expect(report.backupPath).toBeDefined()
      expect(existsSync(report.backupPath!)).toBe(true)
      const snap: Side = { ...to, endpoint: { kind: 'sqlite', path: report.backupPath! } }
      expect(await query(snap, `SELECT id FROM parents WHERE id = 'only-in-target'`)).toHaveLength(
        1,
      )
    }
  })

  it('needs --overwrite for ANY rows, even only a fresh start’s seed rows, and says so', async () => {
    // No heuristic decides what may be cleared silently: a row counts as data.
    const from = await side(fromKind)
    const to = await side(toKind)
    await seededSource(from)
    await prepared(to)
    const opts = { profile: kitchen(), from: from.endpoint, to: to.endpoint, log: () => {} }
    const err = await expectCode(copyDatabase(opts), 'TARGET_NOT_EMPTY', 3)
    expect(err.message).toContain('no more than a freshly started service creates')
    const report = await copyDatabase({
      ...opts,
      overwrite: true,
      ...(toKind === 'postgres' ? { backup: false } : {}),
    })
    expect(report.targetHadData).toBe(true)
    const ids = await query<{ id: string }>(to, `SELECT id FROM parents ORDER BY id`)
    expect(ids.map((r) => r.id)).toEqual(['p1', 'p2', 'seed'])
  })

  it('keeps the newest N snapshots (0600) of a SQLite target, pruning only after a successful copy', async () => {
    if (toKind !== 'sqlite') return
    const from = await side(fromKind)
    const to = await side(toKind)
    await seededSource(from)
    const target = (to.endpoint as { path: string }).path
    const snaps = (): string[] =>
      readdirSync(dirname(target))
        .filter((f) => f.startsWith(`${basename(target)}.pre-copy-`) && f.endsWith('.bak'))
        .sort()
    const opts = {
      profile: kitchen(),
      from: from.endpoint,
      to: to.endpoint,
      overwrite: true,
      log: () => {},
    }
    await copyDatabase(opts) // creates the target: nothing to snapshot yet
    expect(snaps()).toEqual([])
    const made: string[] = []
    for (let i = 0; i < 4; i++) made.push(basename((await copyDatabase(opts)).backupPath!))
    // Default: the newest 3 per database file survive.
    expect(snaps()).toEqual(made.slice(1).sort())
    for (const s of snaps()) expect(statSync(join(dirname(target), s)).mode & 0o777).toBe(0o600)
    const one = await copyDatabase({ ...opts, keepBackups: 1 })
    expect(snaps()).toEqual([basename(one.backupPath!)])
    // A copy that fails prunes nothing: its own snapshot joins the kept one.
    await exec(
      to,
      `CREATE TRIGGER eat_one AFTER INSERT ON events WHEN NEW.id = 2
         BEGIN DELETE FROM events WHERE id = NEW.id; END;`,
    )
    await expectCode(copyDatabase({ ...opts, keepBackups: 1 }), 'ROW_COUNT_MISMATCH', 1)
    expect(snaps()).toHaveLength(2)
  })

  it('always snapshots an existing SQLite target file before writing to it', async () => {
    if (toKind !== 'sqlite') return
    const from = await side(fromKind)
    const to = await side(toKind)
    await seededSource(from)
    // A file with none of the profile's rows: no --overwrite needed, and it
    // is still snapshotted — what counts as worth keeping is not guessed.
    await exec(to, `CREATE TABLE unrelated (x TEXT); INSERT INTO unrelated VALUES ('keep me')`)
    const report = await copyDatabase({
      profile: kitchen(),
      from: from.endpoint,
      to: to.endpoint,
      log: () => {},
    })
    expect(report.targetHadData).toBe(false)
    expect(report.backupPath).toMatch(/\.pre-copy-.+\.bak$/)
    const snap: Side = { ...to, endpoint: { kind: 'sqlite', path: report.backupPath! } }
    expect(await query(snap, `SELECT x FROM unrelated`)).toEqual([{ x: 'keep me' }])
  })

  it('overwriting a Postgres target with rows needs pg_dump, or an explicit --no-backup', async () => {
    if (toKind !== 'postgres') return
    const from = await side(fromKind)
    const to = await side(toKind)
    await seededSource(from)
    await copyDatabase({ profile: kitchen(), from: from.endpoint, to: to.endpoint, log: () => {} })
    await exec(to, `INSERT INTO parents (id, name) VALUES ('only-in-target', 'x')`)
    const opts = {
      profile: kitchen(),
      from: from.endpoint,
      to: to.endpoint,
      overwrite: true,
      pgDump: '/nonexistent/pg_dump',
      log: () => {},
    }
    // No pg_dump here: refused before anything is written — dry run too.
    const err = await expectCode(copyDatabase(opts), 'BACKUP_REQUIRED', 6)
    expect(err.message).toContain('--no-backup')
    await expectCode(copyDatabase({ ...opts, dryRun: true }), 'BACKUP_REQUIRED', 6)
    expect(await query(to, `SELECT id FROM parents WHERE id = 'only-in-target'`)).toHaveLength(1)
    // --no-backup is the explicit way past it.
    await copyDatabase({ ...opts, backup: false })
    expect(await query(to, `SELECT id FROM parents WHERE id = 'only-in-target'`)).toHaveLength(0)
  })

  it('dumps a Postgres target with pg_dump before overwriting it, password off the command line', async () => {
    if (toKind !== 'postgres') return
    const from = await side(fromKind)
    const to = await side(toKind)
    await seededSource(from)
    await copyDatabase({ profile: kitchen(), from: from.endpoint, to: to.endpoint, log: () => {} })
    // A stand-in pg_dump that records what it was given into its --file.
    const bin = mkdtempSync(join(tmpdir(), 'fake-pg-dump-'))
    const fake = join(bin, 'pg_dump')
    writeFileSync(
      fake,
      [
        '#!/bin/sh',
        '[ "$1" = "--version" ] && { echo "pg_dump (PostgreSQL) 16"; exit 0; }',
        'for a in "$@"; do case "$a" in --file=*) f="${a#--file=}" ;; esac; done',
        '{ echo "args: $*"; echo "password-in-env: ${PGPASSWORD:+yes}"; echo "db: $PGDATABASE"; } > "$f"',
      ].join('\n') + '\n',
    )
    chmodSync(fake, 0o755)
    const backupDir = mkdtempSync(join(tmpdir(), 'pg-dump-out-'))
    try {
      const report = await copyDatabase({
        profile: kitchen(),
        from: from.endpoint,
        to: to.endpoint,
        overwrite: true,
        pgDump: fake,
        backupDir,
        log: () => {},
      })
      expect(report.backupPath).toMatch(/kitchen-pre-copy-.+\.dump$/)
      const dump = readFileSync(report.backupPath!, 'utf8')
      for (const t of ['children', 'events', 'parents'])
        expect(dump).toMatch(new RegExp(`--table=\\S+\\.${t}\\b`))
      expect(dump).toContain('password-in-env: yes')
      const password = new URL((to.endpoint as { url: string }).url).password
      expect(dump).not.toContain(password ? `:${password}@` : '@@never@@')
      // No connection URL on the command line at all: it all goes in PG* env.
      expect(dump.split('\n')[0]).not.toMatch(/postgres(ql)?:\/\/|--dbname/)
    } finally {
      rmSync(bin, { recursive: true, force: true })
      rmSync(backupDir, { recursive: true, force: true })
    }
  })

  it('refuses when the source schema is behind this build, and writes nothing', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)
    await prepared(from, kitchen(KITCHEN.slice(0, 1)))
    const err = await expectCode(
      copyDatabase({ profile: kitchen(), from: from.endpoint, to: to.endpoint, log: () => {} }),
      'SCHEMA_MISMATCH',
      4,
    )
    expect(err.message).toContain('kitchen v1 (build v2)')
    if (toKind === 'sqlite') expect(to.exists()).toBe(false)
  })

  it('refuses when the target schema is newer than this build', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)
    await seededSource(from)
    const v3: DualMigration = { version: 3, sqlite: 'SELECT 1', postgres: 'SELECT 1' }
    await prepared(to, kitchen([...KITCHEN, v3]))
    const err = await expectCode(
      copyDatabase({ profile: kitchen(), from: from.endpoint, to: to.endpoint, log: () => {} }),
      'SCHEMA_MISMATCH',
      4,
    )
    expect(err.message).toContain('newer than this build')
  })

  it('rolls back and fails when a row count does not match after the copy', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)
    await seededSource(from)
    await prepared(to)
    // Something in the target eats one row as it is written.
    await exec(
      to,
      toKind === 'postgres'
        ? `CREATE FUNCTION eat_one() RETURNS trigger LANGUAGE plpgsql AS $$
             BEGIN DELETE FROM events WHERE id = NEW.id; RETURN NULL; END $$;
           CREATE TRIGGER eat_one AFTER INSERT ON events FOR EACH ROW
             WHEN (NEW.id = 2) EXECUTE FUNCTION eat_one();`
        : `CREATE TRIGGER eat_one AFTER INSERT ON events WHEN NEW.id = 2
             BEGIN DELETE FROM events WHERE id = NEW.id; END;`,
    )
    const err = await expectCode(
      copyDatabase({
        profile: kitchen(),
        from: from.endpoint,
        to: to.endpoint,
        // The target holds the migration's seed row, so this is an overwrite.
        overwrite: true,
        ...(toKind === 'postgres' ? { backup: false } : {}),
        log: () => {},
      }),
      'ROW_COUNT_MISMATCH',
      1,
    )
    expect(err.message).toContain('events: source 3, copied 3, target 2')
    // Rolled back: nothing the copy wrote is there.
    const n = await query<{ n: unknown }>(to, `SELECT COUNT(*) AS n FROM children`)
    expect(Number(n[0]!.n)).toBe(0)
    const p = await query<{ id: string }>(to, `SELECT id FROM parents`)
    expect(p.map((r) => r.id)).toEqual(['seed'])
  })

  it('a rolled-back --overwrite never lowers a sequence: the next insert still succeeds', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)
    await seededSource(from) // events: ids 1..3, high-water mark 4
    await prepared(to)
    // The target holds MORE rows than the source: events 1..10, generated.
    await exec(
      to,
      Array.from({ length: 10 }, (_, i) => `INSERT INTO events (kind) VALUES ('t${i + 1}');`).join(
        '\n',
      ),
    )
    // Force a rollback: something eats one row as it is written.
    await exec(
      to,
      toKind === 'postgres'
        ? `CREATE FUNCTION eat_one() RETURNS trigger LANGUAGE plpgsql AS $$
             BEGIN DELETE FROM events WHERE id = NEW.id; RETURN NULL; END $$;
           CREATE TRIGGER eat_one AFTER INSERT ON events FOR EACH ROW
             WHEN (NEW.id = 2) EXECUTE FUNCTION eat_one();`
        : `CREATE TRIGGER eat_one AFTER INSERT ON events WHEN NEW.id = 2
             BEGIN DELETE FROM events WHERE id = NEW.id; END;`,
    )
    await expectCode(
      copyDatabase({
        profile: kitchen(),
        from: from.endpoint,
        to: to.endpoint,
        overwrite: true,
        backup: false,
        log: () => {},
      }),
      'ROW_COUNT_MISMATCH',
      1,
    )
    // The ten rows are back — and setval, which no ROLLBACK undoes, must not
    // have left the sequence behind them.
    const n = await query<{ n: unknown }>(to, `SELECT COUNT(*) AS n FROM events`)
    expect(Number(n[0]!.n)).toBe(10)
    await exec(to, `INSERT INTO events (kind) VALUES ('after-rollback')`)
    const id = await query<{ id: string }>(
      to,
      `SELECT CAST(id AS TEXT) AS id FROM events WHERE kind = 'after-rollback'`,
    )
    expect(id.map((r) => r.id)).toEqual(['11'])
  })

  it('reports a source with nothing to copy', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)
    if (fromKind === 'sqlite') {
      // No file at all.
      await expectCode(
        copyDatabase({ profile: kitchen(), from: from.endpoint, to: to.endpoint, log: () => {} }),
        'SOURCE_MISSING',
        5,
      )
    }
    // A database without this profile's schema.
    await exec(from, 'CREATE TABLE unrelated (x TEXT)')
    await expectCode(
      copyDatabase({ profile: kitchen(), from: from.endpoint, to: to.endpoint, log: () => {} }),
      'SOURCE_MISSING',
      5,
    )
  })
})

describe("db-copy: a SQLite source is the service's alone", () => {
  it('refuses tables the profile does not know, unless --ignore-unknown', async () => {
    const from = await side('sqlite')
    const to = await side('sqlite')
    await seededSource(from)
    await exec(from, 'CREATE TABLE stray (x TEXT); INSERT INTO stray VALUES (1)')
    const opts = { profile: kitchen(), from: from.endpoint, to: to.endpoint, log: () => {} }
    const err = await expectCode(copyDatabase(opts), 'SCHEMA_MISMATCH', 4)
    expect(err.message).toContain('table stray')
    expect(to.exists()).toBe(false)
    const report: CopyReport = await copyDatabase({ ...opts, ignoreUnknown: true })
    expect(report.unknownTables).toEqual(['stray'])
    expect(report.totalRows).toBe(9)
  })

  it('refuses to copy a database onto itself', async () => {
    const from = await side('sqlite')
    await seededSource(from)
    await expectCode(
      copyDatabase({ profile: kitchen(), from: from.endpoint, to: from.endpoint, log: () => {} }),
      'USAGE',
      2,
    )
  })
})

describe('runDbCopyCli', () => {
  const profiles = [kitchen()]
  function io() {
    const out: string[] = []
    const err: string[] = []
    return {
      out,
      err,
      io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l), env: {} },
    }
  }

  it('prints help and exits 0', async () => {
    const x = io()
    expect(await runDbCopyCli(['--help'], profiles, x.io)).toBe(0)
    expect(x.out.join('\n')).toContain('--overwrite')
  })

  it('exits 2 on usage errors', async () => {
    const x = io()
    expect(await runDbCopyCli(['--from', 'sqlite:/nope.db'], profiles, x.io)).toBe(2)
    expect(await runDbCopyCli(['--db', 'nope', '--from', 'a', '--to', 'b'], profiles, x.io)).toBe(2)
    expect(
      await runDbCopyCli(['--from', 'env:UNSET_VAR', '--to', 'sqlite:/x.db'], profiles, x.io),
    ).toBe(2)
    expect(x.err.join('\n')).toContain('UNSET_VAR is not set')
  })

  it('copies, then exits 3 on a second run without --overwrite', async () => {
    const from = await side('sqlite')
    const to = await side('sqlite')
    await seededSource(from)
    const args = [
      '--from',
      `sqlite:${(from.endpoint as { path: string }).path}`,
      '--to',
      `sqlite:${(to.endpoint as { path: string }).path}`,
    ]
    const x = io()
    expect(await runDbCopyCli(args, profiles, x.io)).toBe(0)
    expect(x.out.join('\n')).toContain('committed')
    await exec(to, `INSERT INTO parents (id, name) VALUES ('extra', 'x')`)
    expect(await runDbCopyCli(args, profiles, x.io)).toBe(3)
    expect(x.err.join('\n')).toContain('refused (nothing written)')
    expect(await runDbCopyCli([...args, '--overwrite', '--no-backup'], profiles, x.io)).toBe(0)
  })

  it('reads a URL from the environment with env:NAME and never prints it', async () => {
    if (!PG_BASE) return
    const from = await side('sqlite')
    const to = await side('postgres')
    await seededSource(from)
    const url = (to.endpoint as { url: string }).url
    const x = io()
    const code = await runDbCopyCli(
      ['--from', `sqlite:${(from.endpoint as { path: string }).path}`, '--to', 'env:TARGET_URL'],
      profiles,
      { ...x.io, env: { TARGET_URL: url } },
    )
    expect(code).toBe(0)
    const u = new URL(url)
    expect([...x.out, ...x.err].join('\n')).not.toContain(u.password ? `:${u.password}@` : url)
  })
})
