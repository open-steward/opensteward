/**
 * `Conn` over one node-postgres client, in the connection's current schema
 * (normally `public`) — the schema the services' unqualified DDL creates.
 *
 * Its own type parsers, not the process-global ones PostgresDbHandle
 * installs: int8 / numeric / json / jsonb / date-time come back as the text
 * Postgres sent, so nothing is rounded (int8 above 2^53), re-serialised
 * (json key order, whitespace) or shifted into a local time zone. int8 is
 * then narrowed to a JS number only when exact.
 */
import { Client, types as pgTypes } from 'pg'
import { TRACKER_TABLE } from './profile'
import { maxBigInt, quoteIdent, type ColumnInfo, type Conn } from './conn'
import { parseInt8, pgClassOf } from './values'

const TEXT_OIDS = new Set([
  20, // int8
  114, // json
  1082, // date
  1083, // time
  1114, // timestamp
  1184, // timestamptz
  1266, // timetz
  1700, // numeric
  3802, // jsonb
])
const asText = (v: string): string => v

// Postgres caps a statement at 65535 bind parameters.
const MAX_PARAMS = 60_000
const CURSOR = 'db_copy_cursor'

export class PgConn implements Conn {
  readonly dialect = 'postgres' as const
  private readonly sequences = new Map<string, Map<string, string>>()

  private constructor(private readonly client: Client) {}

  static async open(url: string): Promise<PgConn> {
    const getTypeParser = ((oid: number, format?: string) =>
      TEXT_OIDS.has(oid)
        ? asText
        : pgTypes.getTypeParser(oid, format as 'text')) as typeof pgTypes.getTypeParser
    const client = new Client({
      connectionString: url,
      connectionTimeoutMillis: 10_000,
      types: { getTypeParser },
    })
    // An idle client whose server goes away emits 'error'; the next query
    // rejects with it anyway, so swallow the event instead of crashing.
    client.on('error', () => {})
    await client.connect()
    return new PgConn(client)
  }

  private async rows<T>(text: string, values: unknown[] = []): Promise<T[]> {
    return (await this.client.query(text, values)).rows as T[]
  }

  async currentSchema(): Promise<string> {
    const rows = await this.rows<{ s: string }>('SELECT current_schema() AS s')
    return rows[0]!.s
  }

  async listTables(): Promise<string[]> {
    const rows = await this.rows<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    )
    return rows.map((r) => r.name)
  }

  async columns(table: string): Promise<ColumnInfo[]> {
    const cols = await this.rows<{
      column_name: string
      data_type: string
      identity_generation: string | null
      is_generated: string
    }>(
      `SELECT column_name, data_type, identity_generation, is_generated
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1
       ORDER BY ordinal_position`,
      [table],
    )
    const pkRows = await this.rows<{ attname: string; pos: number }>(
      `SELECT a.attname, array_position(i.indkey::int2[], a.attnum) AS pos
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
       WHERE i.indisprimary
         AND i.indrelid = (quote_ident(current_schema()) || '.' || quote_ident($1))::regclass`,
      [table],
    )
    const pkOrder = pkRows.sort((a, b) => a.pos - b.pos).map((r) => r.attname)
    return cols
      .filter((c) => c.is_generated !== 'ALWAYS')
      .map((c) => ({
        name: c.column_name,
        type: c.data_type,
        pk: pkOrder.indexOf(c.column_name) + 1,
        identityAlways: c.identity_generation === 'ALWAYS',
      }))
  }

  async parents(table: string): Promise<string[]> {
    const rows = await this.rows<{ parent: string }>(
      `SELECT DISTINCT pc.relname AS parent
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_class pc ON pc.oid = c.confrelid
       WHERE c.contype = 'f' AND n.nspname = current_schema() AND cl.relname = $1`,
      [table],
    )
    return rows.map((r) => r.parent).filter((p) => p !== table)
  }

  /** column → sequence (as `pg_get_serial_sequence` names it) for serial and identity columns. */
  private async sequenceMap(table: string): Promise<Map<string, string>> {
    const cached = this.sequences.get(table)
    if (cached) return cached
    const rows = await this.rows<{ column_name: string; seq: string | null }>(
      `SELECT column_name,
              pg_get_serial_sequence(quote_ident(table_schema) || '.' || quote_ident(table_name), column_name) AS seq
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1`,
      [table],
    )
    const map = new Map<string, string>()
    for (const r of rows) if (r.seq) map.set(r.column_name, r.seq)
    this.sequences.set(table, map)
    return map
  }

  async sequenceColumns(table: string): Promise<string[]> {
    return [...(await this.sequenceMap(table)).keys()]
  }

  async sequencePosition(table: string, column: string): Promise<bigint> {
    const seq = (await this.sequenceMap(table)).get(column)
    if (!seq) return 0n
    // NULL until the sequence has handed out its first value.
    const rows = await this.rows<{ v: string | null }>(
      `SELECT pg_sequence_last_value($1::regclass)::text AS v`,
      [seq],
    )
    const v = rows[0]?.v
    return v == null ? 0n : BigInt(v)
  }

  async setSequence(table: string, column: string, atLeast: bigint): Promise<bigint> {
    const seq = (await this.sequenceMap(table)).get(column)
    const rows = await this.rows<{ m: string | null }>(
      `SELECT MAX(${quoteIdent(column)})::text AS m FROM ${quoteIdent(table)}`,
    )
    const maxId = rows[0]?.m == null ? 0n : BigInt(rows[0].m)
    if (!seq) return maxId + 1n
    // setval() is not transactional: a ROLLBACK after it keeps the new value.
    // An overwrite that is rolled back (a count mismatch, a failed insert)
    // would otherwise leave a sequence BELOW the target's own ids, and its
    // next insert would collide. So a sequence is only ever raised — past the
    // copied ids, the source's high-water mark and its own current value.
    const cur = await this.rows<{ v: string | null }>(
      `SELECT pg_sequence_last_value($1::regclass)::text AS v`,
      [seq],
    )
    const current = cur[0]?.v == null ? 0n : BigInt(cur[0].v)
    const n = maxBigInt(maxBigInt(atLeast, maxId), current)
    if (n > current) {
      await this.client.query(`SELECT setval($1::regclass, $2::bigint, true)`, [seq, n.toString()])
    }
    return n + 1n
  }

  async migrationVersions(): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    const present = await this.rows<{ present: boolean }>(
      `SELECT to_regclass(quote_ident(current_schema()) || '.' || $1) IS NOT NULL AS present`,
      [TRACKER_TABLE],
    )
    if (!present[0]?.present) return out
    const rows = await this.rows<{ namespace: string; v: number }>(
      `SELECT namespace, MAX(version) AS v FROM ${TRACKER_TABLE} GROUP BY namespace`,
    )
    for (const r of rows) out.set(r.namespace, Number(r.v))
    return out
  }

  async count(table: string): Promise<number> {
    const rows = await this.rows<{ n: string }>(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`)
    return Number(rows[0]?.n ?? 0)
  }

  async begin(mode: 'read' | 'write'): Promise<void> {
    if (mode === 'read') {
      // One snapshot for every count and every row.
      await this.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      return
    }
    await this.client.query('BEGIN')
    // A service still connected to the target holds locks TRUNCATE would wait
    // on forever; fail fast and say why instead.
    await this.client.query(`SET LOCAL lock_timeout = '15s'`)
  }

  async commit(): Promise<void> {
    await this.client.query('COMMIT')
  }

  async rollback(): Promise<void> {
    await this.client.query('ROLLBACK')
  }

  async clear(tables: string[]): Promise<void> {
    if (!tables.length) return
    // One statement so foreign keys between these tables need no ordering. No
    // CASCADE: a table outside the copy that references one of these must
    // stop the copy, not be emptied by it.
    await this.client.query(`TRUNCATE TABLE ${tables.map(quoteIdent).join(', ')}`)
  }

  async *read(
    table: string,
    columns: ColumnInfo[],
    batchSize: number,
  ): AsyncGenerator<unknown[][]> {
    const pk = columns.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk)
    const order = pk.length ? ` ORDER BY ${pk.map((c) => quoteIdent(c.name)).join(', ')}` : ''
    const int8 = columns.map((c) => pgClassOf(c.type) === 'int')
    await this.client.query(
      `DECLARE ${CURSOR} NO SCROLL CURSOR FOR SELECT ${columns
        .map((c) => quoteIdent(c.name))
        .join(', ')} FROM ${quoteIdent(table)}${order}`,
    )
    // Abandoned mid-way (an insert failed), the cursor is closed by the
    // caller's ROLLBACK; only a completed read closes it here, which frees
    // the name for the next table.
    for (;;) {
      const res = await this.client.query({
        text: `FETCH FORWARD ${batchSize} FROM ${CURSOR}`,
        rowMode: 'array',
      })
      const rows = res.rows as unknown[][]
      if (!rows.length) break
      yield rows.map((row) =>
        row.map((v, i) => (int8[i] && typeof v === 'string' ? parseInt8(v) : v)),
      )
    }
    await this.client.query(`CLOSE ${CURSOR}`)
  }

  async insert(table: string, columns: ColumnInfo[], rows: unknown[][]): Promise<void> {
    if (!rows.length) return
    const overriding = columns.some((c) => c.identityAlways) ? ' OVERRIDING SYSTEM VALUE' : ''
    const head = `INSERT INTO ${quoteIdent(table)} (${columns.map((c) => quoteIdent(c.name)).join(', ')})${overriding} VALUES `
    const perStatement = Math.max(1, Math.floor(MAX_PARAMS / Math.max(1, columns.length)))
    for (let start = 0; start < rows.length; start += perStatement) {
      const chunk = rows.slice(start, start + perStatement)
      const values: unknown[] = []
      const tuples = chunk.map((row) => {
        const ph = row.map((v) => {
          values.push(v)
          return `$${values.length}`
        })
        return `(${ph.join(', ')})`
      })
      await this.client.query(head + tuples.join(', '), values)
    }
  }

  async close(): Promise<void> {
    await this.client.end().catch(() => {})
  }
}
