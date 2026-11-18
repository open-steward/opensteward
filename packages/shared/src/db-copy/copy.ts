/**
 * Copy one service database between backends — SQLite → Postgres,
 * Postgres → SQLite (or like to like) — all rows, one transaction.
 *
 * The order of operations is the safety argument:
 *
 *   1. Source, read-only. Its `_schema_migrations` versions must equal this
 *      build's for every namespace the profile migrates. A SQLite source (a
 *      file that belongs to this one service) must hold no table or
 *      namespace the profile does not know — those rows would be silently
 *      left behind — unless `ignoreUnknown`.
 *   2. Target, read-only. Refuse a target whose schema is newer than this
 *      build, and one holding any row in the profile's tables unless
 *      `overwrite`. A dry run stops here.
 *   3. Backup before the first write: an existing SQLite target file is
 *      always snapshotted next to itself; a Postgres target holding rows is
 *      pg_dumped, or the copy refuses unless `backup: false` (--no-backup).
 *   4. The target is migrated through `DbHandle.migrate()` — the service's
 *      own migrator and `DualMigration` arrays, recorded from the profile —
 *      to exactly the source's versions. Same schema, not a translation of
 *      the source's DDL.
 *   5. One source snapshot (SQLite read transaction / Postgres REPEATABLE
 *      READ), one target transaction: clear the profile's tables, copy them
 *      parents-first in batches, move every sequence past the copied ids (and
 *      past the source's high-water mark), count every table, commit only if
 *      each count equals the source's. Anything else rolls back.
 *
 * `_schema_migrations` is never copied: step 4 writes the target's rows and
 * step 1/2 compare them. Nothing prints a row value or a credential.
 */
import { chmodSync, closeSync, existsSync, openSync, readdirSync, unlinkSync } from 'fs'
import { basename, dirname, join } from 'path'
import { pgDumpAvailable, pgDumpTables } from './backup'
import { openDb } from '../db/open'
import type { DbHandle } from '../db/types'
import type { ColumnInfo, Conn } from './conn'
import { describeEndpoint, sameEndpoint, type Endpoint } from './endpoint'
import { DbCopyError, describeDriverError } from './errors'
import { PgConn } from './pg-conn'
import {
  quietly,
  recordProfile,
  TRACKER_TABLE,
  type DbCopyProfile,
  type RecordedProfile,
} from './profile'
import { SqliteConn } from './sqlite-conn'
import { pgClassOf, sqliteAffinityOf, toPg, toSqlite } from './values'

export interface CopyOptions {
  /** The service database: a profile, or one already recorded. */
  profile: DbCopyProfile | RecordedProfile
  from: Endpoint
  to: Endpoint
  /** Replace a target that already holds data (cleared inside the copy's transaction). */
  overwrite?: boolean
  /** Check everything and print the row counts; write nothing. */
  dryRun?: boolean
  /** Copy a SQLite source even though it holds tables the profile does not know. */
  ignoreUnknown?: boolean
  /**
   * Back the target up before writing to it (default true): an existing
   * SQLite file is always snapshotted next to itself; a Postgres target that
   * holds rows is dumped with pg_dump, and the copy refuses (BACKUP_REQUIRED)
   * when pg_dump is not available. false = the caller has a backup.
   */
  backup?: boolean
  /** pg_dump binary (default `pg_dump` on PATH). */
  pgDump?: string
  /** Where a Postgres dump goes (default: the SQLite source's directory, else cwd). */
  backupDir?: string
  /**
   * Snapshots of a SQLite target to keep per database file, newest first
   * (default 3). Older ones are pruned only after a successful copy that took
   * a snapshot.
   */
  keepBackups?: number
  /** Rows per read/insert batch (default 500). */
  batchSize?: number
  log?: (line: string) => void
}

export interface NamespaceReport {
  namespace: string
  /** This build's version (the number of migrations it knows). */
  expected: number
  source: number
  targetBefore: number
  targetAfter: number | null
}

export interface TableReport {
  table: string
  sourceRows: number
  /** null when the table did not exist in the target. */
  targetRowsBefore: number | null
  copied: number
}

export interface CopyReport {
  profile: string
  from: string
  to: string
  dryRun: boolean
  namespaces: NamespaceReport[]
  tables: TableReport[]
  sequences: Array<{ table: string; column: string; next: string }>
  /** SQLite-source tables/namespaces the profile does not know (only with ignoreUnknown). */
  unknownTables: string[]
  unknownNamespaces: string[]
  targetHadData: boolean
  backupPath?: string
  totalRows: number
}

function isRecorded(p: DbCopyProfile | RecordedProfile): p is RecordedProfile {
  return 'namespaces' in p && 'seedCounts' in p
}

async function openConn(ep: Endpoint, role: 'source' | 'target', readonly: boolean): Promise<Conn> {
  try {
    if (ep.kind === 'sqlite') return SqliteConn.open(ep.path, { readonly })
    return await PgConn.open(ep.url)
  } catch (err) {
    throw new DbCopyError(
      'FAILED',
      `cannot open the ${role} (${describeEndpoint(ep)}): ${describeDriverError(err)}`,
      { cause: err },
    )
  }
}

interface TargetState {
  exists: boolean
  versions: Map<string, number>
  /** Row counts of the profile's tables that exist in the target. */
  counts: Map<string, number>
  /** Postgres: the schema the copy writes to. */
  schema?: string
}

async function inspectTarget(to: Endpoint, tables: string[]): Promise<TargetState> {
  if (to.kind === 'sqlite' && !existsSync(to.path)) {
    return { exists: false, versions: new Map(), counts: new Map() }
  }
  const conn = await openConn(to, 'target', true)
  try {
    const versions = await conn.migrationVersions()
    const present = new Set(await conn.listTables())
    const counts = new Map<string, number>()
    for (const t of tables) if (present.has(t)) counts.set(t, await conn.count(t))
    const schema = conn instanceof PgConn ? await conn.currentSchema() : undefined
    return { exists: true, versions, counts, schema }
  } finally {
    await conn.close()
  }
}

/** Parents before children; ties (and any cycle's members) alphabetical. */
export function foreignKeyOrder(tables: string[], parents: Map<string, string[]>): string[] {
  const remaining = new Set(tables)
  const out: string[] = []
  while (remaining.size) {
    const ready = [...remaining]
      .filter((t) => (parents.get(t) ?? []).every((p) => p === t || !remaining.has(p)))
      .sort()
    if (!ready.length) {
      out.push(...[...remaining].sort())
      break
    }
    for (const t of ready) {
      out.push(t)
      remaining.delete(t)
    }
  }
  return out
}

function converterFor(
  to: Endpoint['kind'],
  from: Endpoint['kind'],
  target: ColumnInfo,
  source: ColumnInfo,
  where: string,
): (v: unknown) => unknown {
  if (to === 'postgres') {
    const cls = pgClassOf(target.type)
    return (v) => toPg(v, cls, where)
  }
  const affinity = sqliteAffinityOf(target.type)
  const sourceIsTime = from === 'postgres' && pgClassOf(source.type) === 'time'
  return (v) => toSqlite(v, affinity, sourceIsTime)
}

const SNAPSHOT_TAG = '.pre-copy-'

/**
 * A new, empty, owner-only `<target>.pre-copy-<time>.bak`. Names sort by age;
 * two in the same millisecond get `_1`, `_2`… (which sort after the first).
 */
function newSnapshotFile(target: string): string {
  const base = `${target}${SNAPSHOT_TAG}${stamp()}`
  for (let n = 0; ; n++) {
    const path = n === 0 ? `${base}.bak` : `${base}_${n}.bak`
    try {
      closeSync(openSync(path, 'wx', 0o600))
      return path
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
}

/** Delete all but the newest `keep` snapshots of `target`; returns what went. */
export function pruneSnapshots(target: string, keep: number): string[] {
  const dir = dirname(target)
  const prefix = `${basename(target)}${SNAPSHOT_TAG}`
  const all = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.bak'))
    .sort()
  const doomed = all.slice(0, Math.max(0, all.length - keep))
  for (const f of doomed) unlinkSync(join(dir, f))
  return doomed
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

export async function copyDatabase(opts: CopyOptions): Promise<CopyReport> {
  const log = opts.log ?? ((line: string) => console.log(line))
  const batchSize = opts.batchSize ?? 500
  const keepBackups = opts.keepBackups ?? 3
  if (!Number.isInteger(keepBackups) || keepBackups < 1) {
    throw new DbCopyError('USAGE', `--keep-backups must be a positive integer (got ${keepBackups})`)
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new DbCopyError('USAGE', `batch size must be a positive integer (got ${batchSize})`)
  }
  if (sameEndpoint(opts.from, opts.to)) {
    throw new DbCopyError('USAGE', 'the source and the target are the same database')
  }
  const rec = isRecorded(opts.profile) ? opts.profile : await recordProfile(opts.profile)
  const name = rec.profile.name
  const owned = rec.tables
  const ownedSet = new Set(owned)

  log(`db-copy: ${name} — ${rec.profile.description}`)
  log(`  from  ${describeEndpoint(opts.from)}`)
  log(`  to    ${describeEndpoint(opts.to)}`)
  if (opts.dryRun) log('  dry run: nothing will be written')

  if (opts.from.kind === 'sqlite' && !existsSync(opts.from.path)) {
    throw new DbCopyError('SOURCE_MISSING', `the source file does not exist: ${opts.from.path}`)
  }

  const report: CopyReport = {
    profile: name,
    from: describeEndpoint(opts.from),
    to: describeEndpoint(opts.to),
    dryRun: !!opts.dryRun,
    namespaces: [],
    tables: [],
    sequences: [],
    unknownTables: [],
    unknownNamespaces: [],
    targetHadData: false,
    totalRows: 0,
  }

  const source = await openConn(opts.from, 'source', true)
  let target: Conn | undefined
  let sourceInTxn = false
  try {
    // ── 1. The source ──────────────────────────────────────────────────────
    const srcVersions = await source.migrationVersions()
    const srcTables = new Set(await source.listTables())
    if (!rec.namespaces.some((n) => (srcVersions.get(n.namespace) ?? 0) > 0)) {
      throw new DbCopyError(
        'SOURCE_MISSING',
        `the source holds no ${name} schema (none of ${rec.namespaces
          .map((n) => n.namespace)
          .join(', ')} is migrated there) — nothing to copy`,
      )
    }
    if (opts.from.kind === 'sqlite') {
      report.unknownTables = [...srcTables]
        .filter((t) => t !== TRACKER_TABLE && !ownedSet.has(t))
        .sort()
      report.unknownNamespaces = [...srcVersions.keys()]
        .filter((ns) => !rec.namespaces.some((n) => n.namespace === ns))
        .sort()
      const unknown = [
        ...report.unknownTables.map((t) => `table ${t}`),
        ...report.unknownNamespaces.map((ns) => `migration namespace ${ns}`),
      ]
      if (unknown.length) {
        if (!opts.ignoreUnknown) {
          throw new DbCopyError(
            'SCHEMA_MISMATCH',
            `the source holds ${unknown.join(', ')}, which the ${name} profile does not ` +
              `open, so its rows would be left behind. If a store was added to the service, ` +
              `add it to the profile; if these are obsolete, re-run with --ignore-unknown.`,
          )
        }
        log(`  NOT copied (--ignore-unknown): ${unknown.join(', ')}`)
      }
    }

    // ── 2. The target, read-only ───────────────────────────────────────────
    const tgt = await inspectTarget(opts.to, owned)
    const width = Math.max(...rec.namespaces.map((n) => n.namespace.length), 9)
    log(`  schema (this build's version must match the source's):`)
    for (const n of rec.namespaces) {
      const entry: NamespaceReport = {
        namespace: n.namespace,
        expected: n.migrations.length,
        source: srcVersions.get(n.namespace) ?? 0,
        targetBefore: tgt.versions.get(n.namespace) ?? 0,
        targetAfter: null,
      }
      report.namespaces.push(entry)
      log(
        `    ${n.namespace.padEnd(width)}  build v${entry.expected}  source v${entry.source}  target v${entry.targetBefore}`,
      )
    }
    const srcOff = report.namespaces.filter((n) => n.source !== n.expected)
    if (srcOff.length) {
      throw new DbCopyError(
        'SCHEMA_MISMATCH',
        `the source's schema is not this build's: ${srcOff
          .map((n) => `${n.namespace} v${n.source} (build v${n.expected})`)
          .join(', ')}. Boot the service once against the source with this build (that ` +
          `migrates it forward), or copy with the build that last wrote it.`,
      )
    }
    const tgtNewer = report.namespaces.filter((n) => n.targetBefore > n.expected)
    if (tgtNewer.length) {
      throw new DbCopyError(
        'SCHEMA_MISMATCH',
        `the target's schema is newer than this build: ${tgtNewer
          .map((n) => `${n.namespace} v${n.targetBefore} (build v${n.expected})`)
          .join(', ')}. Copy with the build that last wrote the target.`,
      )
    }
    const missing = owned.filter((t) => !srcTables.has(t))
    if (missing.length) {
      throw new DbCopyError(
        'SCHEMA_MISMATCH',
        `the source is at this build's versions but lacks table(s) ${missing.join(', ')}`,
      )
    }
    // Any row in any of the profile's tables is data: nothing is cleared
    // without --overwrite on the strength of a guess about which rows matter.
    // The seed counts only word the message.
    const withRows = owned.filter((t) => (tgt.counts.get(t) ?? 0) > 0)
    report.targetHadData = withRows.length > 0
    const onlySeedRows = withRows.every((t) => (tgt.counts.get(t) ?? 0) <= (rec.seedCounts[t] ?? 0))
    const refuseTarget = (): DbCopyError =>
      new DbCopyError(
        'TARGET_NOT_EMPTY',
        `the target already holds ${name} rows (${withRows
          .map((t) => `${t}: ${fmt(tgt.counts.get(t) ?? 0)}`)
          .join(', ')})` +
          (onlySeedRows
            ? ` — no more than a freshly started service creates, so replacing them is likely safe`
            : '') +
          `. Re-run with --overwrite to replace them.`,
      )

    // What will be backed up before anything is written, and whether it can be.
    const wantBackup = opts.backup !== false
    const pgDumpBin = opts.pgDump ?? 'pg_dump'
    const backupDir =
      opts.backupDir ?? (opts.from.kind === 'sqlite' ? dirname(opts.from.path) : process.cwd())
    const needPgDump = wantBackup && opts.to.kind === 'postgres' && report.targetHadData
    const refuseNoPgDump = (): DbCopyError =>
      new DbCopyError(
        'BACKUP_REQUIRED',
        `--overwrite would replace the rows the Postgres target holds, and ${pgDumpBin} is not ` +
          `available here to back them up first. Dump the database yourself (scripts/switch-db.sh ` +
          `does, with the postgres container's pg_dump), then re-run with --no-backup.`,
      )

    const pad = Math.max(...owned.map((t) => t.length), 5)
    if (opts.dryRun) {
      log(`  tables:`)
      for (const t of owned) {
        const n = await source.count(t)
        const before = tgt.counts.has(t) ? tgt.counts.get(t)! : null
        report.tables.push({ table: t, sourceRows: n, targetRowsBefore: before, copied: 0 })
        report.totalRows += n
        log(
          `    ${t.padEnd(pad)}  ${fmt(n).padStart(10)} rows` +
            (before === null ? '  (target: no table yet)' : `  (target now: ${fmt(before)})`),
        )
      }
      if (report.targetHadData && !opts.overwrite) throw refuseTarget()
      if (needPgDump && !pgDumpAvailable(pgDumpBin)) throw refuseNoPgDump()
      if (wantBackup && opts.to.kind === 'sqlite' && tgt.exists) {
        log(`  would snapshot the target file first (<file>.pre-copy-<time>.bak)`)
      } else if (needPgDump) {
        log(`  would pg_dump the target's ${name} tables to ${backupDir} first`)
      }
      log(
        `  dry run OK: would copy ${fmt(report.totalRows)} rows in ${owned.length} tables` +
          (report.targetHadData ? ', replacing the rows the target holds now' : ''),
      )
      return report
    }
    if (report.targetHadData && !opts.overwrite) throw refuseTarget()
    if (needPgDump && !pgDumpAvailable(pgDumpBin)) throw refuseNoPgDump()

    // ── 3. Back up the target before the first write ────────────────────────
    // A SQLite file that exists is always snapshotted, rows or not.
    if (wantBackup && opts.to.kind === 'sqlite' && tgt.exists) {
      // Created owner-only before a byte is written: it holds the same
      // encrypted credentials and PII as the database.
      const path = newSnapshotFile(opts.to.path)
      const snap = SqliteConn.open(opts.to.path, { readonly: true })
      try {
        await snap.backupTo(path)
      } finally {
        await snap.close()
      }
      chmodSync(path, 0o600)
      report.backupPath = path
      log(`  snapshot of the target file: ${path}`)
    }
    if (needPgDump && opts.to.kind === 'postgres') {
      const path = join(backupDir, `${name}-pre-copy-${stamp()}.dump`)
      pgDumpTables({
        bin: pgDumpBin,
        url: opts.to.url,
        schema: tgt.schema ?? 'public',
        tables: owned.filter((t) => tgt.counts.has(t)),
        file: path,
      })
      report.backupPath = path
      log(`  pg_dump of the target's ${name} tables: ${path}`)
    }

    // ── 4. Target schema, through the service's own migrator ────────────────
    let handle: DbHandle
    try {
      handle = await openDb(
        opts.to.kind === 'sqlite'
          ? { sqlitePath: opts.to.path }
          : { databaseUrl: opts.to.url, poolMax: 1 },
      )
    } catch (err) {
      throw new DbCopyError(
        'FAILED',
        `cannot open the target (${describeEndpoint(opts.to)}): ${describeDriverError(err)}`,
        { cause: err },
      )
    }
    try {
      for (const n of rec.namespaces) {
        const r = await quietly(() => handle.migrate(n.namespace, n.migrations))
        const entry = report.namespaces.find((e) => e.namespace === n.namespace)!
        entry.targetAfter = r.toVersion
        if (r.applied.length) {
          log(`  migrated target ${n.namespace}: v${r.fromVersion} → v${r.toVersion}`)
        }
      }
    } catch (err) {
      throw new DbCopyError('FAILED', `migrating the target failed: ${describeDriverError(err)}`, {
        cause: err,
      })
    } finally {
      await handle.close()
    }

    // ── 5. Copy ─────────────────────────────────────────────────────────────
    target = await openConn(opts.to, 'target', false)
    const plans = new Map<
      string,
      { cols: ColumnInfo[]; srcCols: ColumnInfo[]; convert: Array<(v: unknown) => unknown> }
    >()
    const parents = new Map<string, string[]>()
    for (const t of owned) {
      const cols = await target.columns(t)
      const srcCols = await source.columns(t)
      if (!cols.length) {
        throw new DbCopyError('SCHEMA_MISMATCH', `table ${t} is missing from the migrated target`)
      }
      const srcByName = new Map(srcCols.map((c) => [c.name, c]))
      const tgtNames = new Set(cols.map((c) => c.name))
      const onlySource = srcCols.filter((c) => !tgtNames.has(c.name)).map((c) => c.name)
      const onlyTarget = cols.filter((c) => !srcByName.has(c.name)).map((c) => c.name)
      if (onlySource.length || onlyTarget.length) {
        throw new DbCopyError(
          'SCHEMA_MISMATCH',
          `columns of ${t} differ at the same schema version: source only [${onlySource.join(
            ', ',
          )}], target only [${onlyTarget.join(', ')}]`,
        )
      }
      const aligned = cols.map((c) => srcByName.get(c.name)!)
      plans.set(t, {
        cols,
        srcCols: aligned,
        convert: cols.map((c, i) =>
          converterFor(opts.to.kind, opts.from.kind, c, aligned[i]!, `${t}.${c.name}`),
        ),
      })
      parents.set(
        t,
        (await target.parents(t)).filter((p) => ownedSet.has(p)),
      )
    }
    const order = foreignKeyOrder(owned, parents)

    await source.begin('read')
    sourceInTxn = true
    const srcCounts = new Map<string, number>()
    for (const t of order) srcCounts.set(t, await source.count(t))

    await target.begin('write')
    try {
      await target.clear(order)
      log(`  tables (parents first):`)
      for (const t of order) {
        const plan = plans.get(t)!
        const total = srcCounts.get(t)!
        let copied = 0
        try {
          for await (const batch of source.read(t, plan.srcCols, batchSize)) {
            const rows = batch.map((row) => row.map((v, i) => plan.convert[i]!(v)))
            await target.insert(t, plan.cols, rows)
            copied += rows.length
          }
        } catch (err) {
          if (err instanceof DbCopyError) throw err
          throw new DbCopyError(
            'FAILED',
            `copying ${t} (after ${fmt(copied)} of ${fmt(total)} rows): ${describeDriverError(err)}`,
            { cause: err },
          )
        }
        report.tables.push({
          table: t,
          sourceRows: total,
          targetRowsBefore: tgt.counts.has(t) ? tgt.counts.get(t)! : null,
          copied,
        })
        report.totalRows += copied
        log(`    ${t.padEnd(pad)}  ${fmt(copied).padStart(10)} rows`)
      }

      for (const t of order) {
        const srcSeq = new Set(await source.sequenceColumns(t))
        for (const col of await target.sequenceColumns(t)) {
          const pos = srcSeq.has(col) ? await source.sequencePosition(t, col) : 0n
          const next = await target.setSequence(t, col, pos)
          report.sequences.push({ table: t, column: col, next: next.toString() })
        }
      }
      if (report.sequences.length) {
        log(
          `  sequences: ${report.sequences.map((s) => `${s.table}.${s.column} next ${s.next}`).join(', ')}`,
        )
      }

      const mismatches: string[] = []
      for (const r of report.tables) {
        const now = await target.count(r.table)
        if (now !== r.sourceRows || r.copied !== r.sourceRows) {
          mismatches.push(
            `${r.table}: source ${fmt(r.sourceRows)}, copied ${fmt(r.copied)}, target ${fmt(now)}`,
          )
        }
      }
      if (mismatches.length) {
        throw new DbCopyError(
          'ROW_COUNT_MISMATCH',
          `row counts differ after the copy, so it was rolled back and the target's rows are ` +
            `unchanged: ${mismatches.join('; ')}`,
        )
      }
      await target.commit()
    } catch (err) {
      await target.rollback().catch(() => {})
      if (err instanceof DbCopyError) throw err
      throw new DbCopyError(
        'FAILED',
        `copy failed and was rolled back: ${describeDriverError(err)}`,
        {
          cause: err,
        },
      )
    }
    log(
      `  verified: ${report.tables.length} tables, ${fmt(report.totalRows)} rows — every count matches the source`,
    )
    log('  committed')
    if (opts.to.kind === 'sqlite' && report.backupPath) {
      const pruned = pruneSnapshots(opts.to.path, keepBackups)
      if (pruned.length) {
        log(`  pruned ${pruned.length} older snapshot(s); kept the newest ${keepBackups}`)
      }
    }
    return report
  } finally {
    if (sourceInTxn) await source.rollback().catch(() => {})
    await source.close()
    await target?.close()
  }
}
