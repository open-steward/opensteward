/**
 * Iceberg destination — EXPERIMENTAL, "iceberg-ready" mode.
 *
 * What it does, all of it through documented, JSON-only parts of the
 * Iceberg REST catalog spec:
 *
 *   - `GET /v1/config` for the catalog's path prefix;
 *   - creates the namespace when it is missing;
 *   - creates one table per (vertical, resource type), `os_<vertical>_<type>`,
 *     with a schema derived from the export columns and a
 *     `schema.name-mapping.default` property, so Parquet files without
 *     Iceberg field ids map onto it by column name;
 *   - evolves that schema (add-schema + set-current-schema, guarded by
 *     assert-current-schema-id) as new flattened fields appear.
 *
 * What it does NOT do: commit data snapshots. An append commit needs Avro
 * manifest and manifest-list files (and reading the parent's), which this
 * package does not write; a partial implementation would risk corrupting
 * the operator's table. Instead each batch's Parquet file is written in an
 * Iceberg-friendly layout under the table location, typed to the table's
 * schema (`changed_at` as microsecond `timestamptz`), in its own directory:
 *
 *   <storage>/<namespace…>/<table>/data/batch_<id>/00000.parquet
 *   <storage>/<namespace…>/<table>/_deletes/batch_<id>.parquet
 *   <storage>/<namespace…>/<table>/_opensteward/pending/<id>.json
 *
 * and the pending manifest names the files to register — e.g. Spark's
 * `CALL <catalog>.system.add_files(...)` per batch directory, Snowflake's
 * `ALTER ICEBERG TABLE … REFRESH`, or Glue/Athena. The table holds rows as an
 * append log: dedupe on `_pk` keeping the greatest `changed_at`, and apply
 * `_deletes/` — see docs/integrate/destinations.md.
 */
import { randomUUID } from 'node:crypto'
import { FIXED_COLUMNS } from '../transform'
import type { TableSink } from '../types'
import type { ColumnKind, FlatColumn } from '../writers/parquet'
import { createLoaderSink, type LoaderDriver } from './engine'
import type { IcebergConfig, IcebergSecrets } from './schemas'
import { createStage, type StageDeps, type StagedFile } from './stage'
import { assertGenerated } from './sql'

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface IcebergLoaderDeps extends StageDeps {
  /** Test seam; default global `fetch`. */
  fetch?: FetchLike
  newId?: () => string
  now?: () => number
}

type IcebergType = string | Record<string, unknown>

interface IcebergField {
  id: number
  name: string
  required: boolean
  type: IcebergType
}

interface TableState {
  uuid: string | undefined
  location: string | undefined
  schemaId: number
  /** Highest schema id in the table's history (a new schema takes the next one). */
  maxSchemaId: number
  lastColumnId: number
  fields: IcebergField[]
}

/** Iceberg type of each fixed export column. */
const FIXED_TYPES: Record<(typeof FIXED_COLUMNS)[number], string> = {
  _pk: 'string',
  connection_id: 'string',
  owner_tenant_id: 'string',
  platform: 'string',
  vertical: 'string',
  resource_type: 'string',
  resource_id: 'string',
  changed_at: 'timestamptz',
  norm_version: 'string',
  _deleted: 'boolean',
  data: 'string',
}

const ICEBERG_TYPE: Record<ColumnKind, string> = {
  string: 'string',
  int: 'long',
  float: 'double',
  bool: 'boolean',
}

function kindOfIcebergType(t: IcebergType): ColumnKind {
  switch (t) {
    case 'long':
    case 'int':
      return 'int'
    case 'double':
    case 'float':
      return 'float'
    case 'boolean':
      return 'bool'
    default:
      return 'string'
  }
}

/** The initial schema: the fixed columns, ids 1…11. */
export function initialIcebergFields(): IcebergField[] {
  return FIXED_COLUMNS.map((name, i) => ({
    id: i + 1,
    name,
    required: false,
    type: FIXED_TYPES[name],
  }))
}

/** `schema.name-mapping.default`: every top-level field by its name. */
export function nameMapping(fields: IcebergField[]): string {
  return JSON.stringify(fields.map((f) => ({ 'field-id': f.id, names: [f.name] })))
}

export class IcebergCatalogError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'IcebergCatalogError'
  }
}

export async function createIcebergLoader(
  config: IcebergConfig,
  secrets: IcebergSecrets,
  deps: IcebergLoaderDeps,
): Promise<TableSink> {
  const base = new URL(config.catalogUri)
  await deps.hostGuard(base.hostname)
  const fetchImpl: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init))
  const namespace = config.namespace.split('.')
  const nsPath = namespace.join('/')
  const nsParam = encodeURIComponent(namespace.join('\u001f'))
  const now = deps.now ?? Date.now
  const newId = deps.newId ?? (() => randomUUID().replace(/-/g, ''))

  const stage = await createStage(config.storage, secrets, 'spark', deps)
  const root = base.href.replace(/\/+$/, '')

  async function call(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: Record<string, unknown> | null }> {
    const res = await fetchImpl(`${root}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(secrets.token ? { authorization: `Bearer ${secrets.token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const text = await res.text()
    let json: Record<string, unknown> | null = null
    if (text) {
      try {
        json = JSON.parse(text) as Record<string, unknown>
      } catch {
        json = null
      }
    }
    return { status: res.status, json }
  }

  function fail(what: string, r: { status: number; json: Record<string, unknown> | null }): never {
    const err = (r.json?.['error'] ?? {}) as { message?: unknown; type?: unknown }
    const detail = typeof err.message === 'string' ? `: ${err.message.slice(0, 300)}` : ''
    throw new IcebergCatalogError(
      r.status,
      `Iceberg catalog ${what} failed (HTTP ${r.status})${detail}`,
    )
  }

  let prefix: string | undefined
  async function paths(): Promise<{ ns: string; tables: string }> {
    if (prefix === undefined) {
      const q = config.warehouse ? `?warehouse=${encodeURIComponent(config.warehouse)}` : ''
      const r = await call('GET', `/v1/config${q}`)
      if (r.status !== 200) fail('config', r)
      const overrides = (r.json?.['overrides'] ?? {}) as Record<string, unknown>
      const defaults = (r.json?.['defaults'] ?? {}) as Record<string, unknown>
      const p = overrides['prefix'] ?? defaults['prefix']
      // The spec inserts the prefix verbatim; encode each segment so a hostile
      // catalog response can't add query strings or `..` hops.
      const segments =
        typeof p === 'string'
          ? p
              .split('/')
              .filter((x) => x !== '' && x !== '.' && x !== '..')
              .map(encodeURIComponent)
          : []
      prefix = segments.length > 0 ? `/${segments.join('/')}` : ''
    }
    return { ns: `/v1${prefix}/namespaces`, tables: `/v1${prefix}/namespaces/${nsParam}/tables` }
  }

  let namespaceReady = false
  async function ensureNamespace(): Promise<void> {
    if (namespaceReady) return
    const p = await paths()
    const got = await call('GET', `${p.ns}/${nsParam}`)
    if (got.status === 404) {
      const made = await call('POST', p.ns, { namespace, properties: {} })
      if (made.status !== 200 && made.status !== 409) fail('create namespace', made)
    } else if (got.status !== 200 && got.status !== 204) {
      fail('load namespace', got)
    }
    namespaceReady = true
  }

  const states = new Map<string, TableState>()

  function stateOf(json: Record<string, unknown> | null): TableState {
    const meta = (json?.['metadata'] ?? {}) as Record<string, unknown>
    const schemaId = Number(meta['current-schema-id'] ?? 0)
    const schemas = (meta['schemas'] ?? []) as Array<Record<string, unknown>>
    const schema =
      schemas.find((s) => Number(s['schema-id'] ?? 0) === schemaId) ??
      (meta['schema'] as Record<string, unknown> | undefined) ??
      {}
    const fields = ((schema['fields'] ?? []) as Array<Record<string, unknown>>).map((f) => ({
      id: Number(f['id']),
      name: String(f['name']),
      required: f['required'] === true,
      type: f['type'] as IcebergType,
    }))
    return {
      uuid: typeof meta['table-uuid'] === 'string' ? meta['table-uuid'] : undefined,
      location: typeof meta['location'] === 'string' ? meta['location'] : undefined,
      schemaId,
      maxSchemaId: Math.max(schemaId, ...schemas.map((x) => Number(x['schema-id'] ?? 0))),
      lastColumnId: Number(meta['last-column-id'] ?? Math.max(0, ...fields.map((f) => f.id))),
      fields,
    }
  }

  async function load(table: string): Promise<TableState | null> {
    await ensureNamespace()
    const p = await paths()
    const r = await call(
      'GET',
      `${p.tables}/${encodeURIComponent(assertGenerated(table, 'table'))}`,
    )
    if (r.status === 404) {
      states.delete(table)
      return null
    }
    if (r.status !== 200) fail('load table', r)
    const s = stateOf(r.json)
    states.set(table, s)
    return s
  }

  const tableDir = (table: string) => `${nsPath}/${assertGenerated(table, 'table')}`

  const driver: LoaderDriver = {
    async describe(table) {
      const s = await load(table)
      if (!s) return null
      return new Map(s.fields.map((f) => [f.name.toLowerCase(), kindOfIcebergType(f.type)]))
    },
    async createTable(table) {
      await ensureNamespace()
      const p = await paths()
      const fields = initialIcebergFields()
      const r = await call('POST', p.tables, {
        name: table,
        location: `${stage.baseUrl}${tableDir(table)}`,
        schema: { type: 'struct', 'schema-id': 0, fields },
        'stage-create': false,
        properties: {
          'format-version': '2',
          'schema.name-mapping.default': nameMapping(fields),
          'write.parquet.compression-codec': 'snappy',
          'opensteward.layout': 'iceberg-ready',
        },
      })
      if (r.status === 409) return // created concurrently; describe() reloads it
      if (r.status !== 200) fail('create table', r)
      states.set(table, stateOf(r.json))
    },
    async addColumns(table, columns) {
      for (let attempt = 0; ; attempt++) {
        const s = states.get(table) ?? (await load(table))
        if (!s) throw new IcebergCatalogError(404, `Iceberg table ${table} disappeared.`)
        const have = new Set(s.fields.map((f) => f.name.toLowerCase()))
        const missing = columns.filter((c) => !have.has(c.name))
        if (missing.length === 0) return
        let last = Math.max(s.lastColumnId, ...s.fields.map((f) => f.id))
        const fields: IcebergField[] = [
          ...s.fields,
          ...missing.map((c) => ({
            id: ++last,
            name: c.name,
            required: false,
            type: ICEBERG_TYPE[c.kind],
          })),
        ]
        const p = await paths()
        const r = await call('POST', `${p.tables}/${encodeURIComponent(table)}`, {
          requirements: [
            ...(s.uuid ? [{ type: 'assert-table-uuid', uuid: s.uuid }] : []),
            { type: 'assert-current-schema-id', 'current-schema-id': s.schemaId },
          ],
          updates: [
            {
              action: 'add-schema',
              schema: { type: 'struct', 'schema-id': s.maxSchemaId + 1, fields },
              'last-column-id': last,
            },
            { action: 'set-current-schema', 'schema-id': -1 },
            {
              action: 'set-properties',
              updates: { 'schema.name-mapping.default': nameMapping(fields) },
            },
          ],
        })
        if (r.status === 200) {
          states.set(table, stateOf(r.json))
          return
        }
        // Someone else changed the schema first: reload and try again.
        if (r.status === 409 && attempt < 3) {
          states.delete(table)
          continue
        }
        fail('schema update', r)
      }
    },
    async mergeRows(table, file, columns, rowCount) {
      await writePending(table, 'rows', file, rowCount, columns)
      return rowCount
    },
    async applyDeletes(table, deletes, stageDeletes) {
      // Every tombstone goes to the table's `_deletes/` log; applying them is
      // the reader's (or the operator's MERGE's) job in this mode.
      const file = await stageDeletes(deletes)
      await writePending(table, 'deletes', file, deletes.length, [])
      return deletes.length
    },
    async test() {
      const p = await paths()
      const r = await call('GET', `${p.ns}/${nsParam}`)
      if (r.status !== 200 && r.status !== 204 && r.status !== 404) fail('load namespace', r)
    },
    async close() {},
  }

  async function writePending(
    table: string,
    kind: 'rows' | 'deletes',
    file: StagedFile,
    recordCount: number,
    columns: FlatColumn[],
  ): Promise<void> {
    const id = /batch_([A-Za-z0-9]+)/.exec(file.path)?.[1] ?? newId()
    const s = states.get(table)
    const manifest = {
      version: 1,
      format: 'iceberg-ready',
      experimental: true,
      kind,
      table: { namespace, name: table, location: s?.location ?? null },
      catalog: { uri: root, warehouse: config.warehouse ?? null },
      schemaId: s?.schemaId ?? null,
      directory: file.dirUrl,
      files: [{ path: file.url, format: 'PARQUET', recordCount, fileSizeInBytes: file.bytes }],
      columns:
        kind === 'rows' ? columns.map((c) => ({ name: c.name, type: ICEBERG_TYPE[c.kind] })) : [],
      createdAt: new Date(now()).toISOString(),
    }
    await stage.upload(
      `${tableDir(table)}/_opensteward/pending/${id}.json`,
      new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
      'application/json',
    )
  }

  return createLoaderSink({
    stage,
    driver,
    newId,
    keepStagedFiles: true,
    timestampUnit: 'us',
    rowsPath: (table, id) => `${tableDir(table)}/data/batch_${id}/00000.parquet`,
    deletesPath: (table, id) => `${tableDir(table)}/_deletes/batch_${id}.parquet`,
  })
}
