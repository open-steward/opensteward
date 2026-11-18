/**
 * Iceberg (experimental, iceberg-ready) against an in-memory REST catalog:
 * the config prefix, namespace and table creation with a name mapping,
 * schema evolution guarded by assert-current-schema-id (with a 409 retry),
 * data files typed to the table with microsecond `changed_at`, pending
 * manifests, the deletes log, and that nothing is ever snapshot-committed.
 */
import { describe, it, expect } from 'vitest'
import { createIcebergLoader, initialIcebergFields, nameMapping } from '../src/loaders/iceberg'
import { IcebergConfigSchema } from '../src/loaders/schemas'
import { readParquetRows } from '../src/writers/parquet'
import { TARGET, allowAll, del, fakeObjectStore, ids, row } from './helpers/loader-fakes'

const CONFIG = IcebergConfigSchema.parse({
  catalogUri: 'https://catalog.example.com/api/catalog/',
  warehouse: 'lake',
  namespace: 'analytics.opensteward',
  storage: { type: 's3', url: 's3://lake/iceberg/' },
})

interface Req {
  method: string
  path: string
  body?: Record<string, unknown>
  auth?: string
}

/** A small, strict REST catalog: enough of the spec to check what the loader sends. */
function fakeCatalog(opts: { conflictOnce?: boolean } = {}) {
  const requests: Req[] = []
  const namespaces = new Set<string>()
  const tables = new Map<string, Record<string, unknown>>()
  let conflict = opts.conflictOnce === true
  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const u = new URL(url)
    const path = u.pathname.replace('/api/catalog', '') + u.search
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    const auth = (init.headers as Record<string, string>)['authorization']
    requests.push({
      method: init.method!,
      path,
      ...(body ? { body } : {}),
      ...(auth ? { auth } : {}),
    })
    expect(init.redirect).toBe('error')
    if (path === '/v1/config?warehouse=lake')
      return json(200, { defaults: {}, overrides: { prefix: 'lake-prefix' } })
    const ns = /^\/v1\/lake-prefix\/namespaces\/([^/]+)$/.exec(
      u.pathname.replace('/api/catalog', ''),
    )
    if (ns && init.method === 'GET')
      return namespaces.has(ns[1]!)
        ? json(200, { namespace: [] })
        : json(404, { error: { message: 'no ns' } })
    if (path === '/v1/lake-prefix/namespaces' && init.method === 'POST') {
      namespaces.add(encodeURIComponent((body!['namespace'] as string[]).join('\u001f')))
      return json(200, { namespace: body!['namespace'] })
    }
    const tbl = /^\/v1\/lake-prefix\/namespaces\/([^/]+)\/tables(?:\/([^/]+))?$/.exec(
      u.pathname.replace('/api/catalog', ''),
    )
    if (tbl) {
      const key = `${tbl[1]}/${tbl[2] ?? body?.['name']}`
      if (!tbl[2] && init.method === 'POST') {
        const schema = body!['schema'] as { fields: Array<{ id: number }> }
        const meta = {
          'format-version': 2,
          'table-uuid': 'uuid-1',
          location: body!['location'],
          'current-schema-id': 0,
          'last-column-id': Math.max(...schema.fields.map((f) => f.id)),
          schemas: [{ ...schema, 'schema-id': 0 }],
          properties: body!['properties'],
        }
        tables.set(key, meta)
        return json(200, { 'metadata-location': 's3://lake/meta/0.json', metadata: meta })
      }
      const meta = tables.get(key)
      if (!meta) return json(404, { error: { message: 'NoSuchTable' } })
      if (init.method === 'GET') return json(200, { metadata: meta })
      // Commit: check requirements, apply updates.
      for (const r of body!['requirements'] as Array<Record<string, unknown>>) {
        if (r['type'] === 'assert-table-uuid' && r['uuid'] !== meta['table-uuid'])
          return json(409, {})
        if (
          r['type'] === 'assert-current-schema-id' &&
          r['current-schema-id'] !== meta['current-schema-id']
        ) {
          return json(409, { error: { message: 'schema changed' } })
        }
      }
      if (conflict) {
        conflict = false
        // Someone else evolved the schema meanwhile: add `other` as id 12.
        const cur = (meta['schemas'] as Array<Record<string, unknown>>)[0]!
        const fields = [
          ...(cur['fields'] as unknown[]),
          { id: 12, name: 'other', required: false, type: 'string' },
        ]
        meta['schemas'] = [
          ...(meta['schemas'] as unknown[]),
          { type: 'struct', 'schema-id': 1, fields },
        ]
        meta['current-schema-id'] = 1
        meta['last-column-id'] = 12
        return json(409, { error: { message: 'Requirement failed: current schema changed' } })
      }
      for (const up of body!['updates'] as Array<Record<string, unknown>>) {
        if (up['action'] === 'add-schema') {
          meta['schemas'] = [...(meta['schemas'] as unknown[]), up['schema']]
          meta['last-column-id'] = up['last-column-id']
        } else if (up['action'] === 'set-current-schema') {
          const schemas = meta['schemas'] as Array<Record<string, unknown>>
          meta['current-schema-id'] =
            up['schema-id'] === -1 ? schemas.at(-1)!['schema-id'] : up['schema-id']
        } else if (up['action'] === 'set-properties') {
          meta['properties'] = { ...(meta['properties'] as object), ...(up['updates'] as object) }
        } else {
          throw new Error(`unexpected update ${String(up['action'])}`)
        }
      }
      return json(200, { 'metadata-location': 's3://lake/meta/1.json', metadata: meta })
    }
    return json(500, { error: { message: `unexpected ${init.method} ${path}` } })
  }
  return { fetch, requests, tables }
}

describe('Iceberg loader (experimental)', () => {
  it('creates namespace and table, writes typed data files and a pending manifest', async () => {
    const cat = fakeCatalog()
    const store = fakeObjectStore()
    const guarded: string[] = []
    const sink = await createIcebergLoader(
      CONFIG,
      { token: 'tok-123' },
      {
        hostGuard: async (h) => void guarded.push(h),
        sink: store,
        fetch: cat.fetch,
        newId: ids('b'),
        now: () => Date.UTC(2026, 8, 29),
      },
    )
    expect(guarded).toEqual(['catalog.example.com'])

    const res = await sink.applyBatch(
      TARGET,
      [
        row('a', 1_700_000_000_123, { score: 3, name: 'Ada' }),
        row('a', 1_700_000_000_456, { score: 4 }),
      ],
      [],
    )
    expect(res).toEqual({ upserted: 1, deleted: 0 })

    const ns = 'analytics%1Fopensteward'
    expect(cat.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /v1/config?warehouse=lake',
      `GET /v1/lake-prefix/namespaces/${ns}`,
      'POST /v1/lake-prefix/namespaces',
      `GET /v1/lake-prefix/namespaces/${ns}/tables/os_crm_contacts`,
      `POST /v1/lake-prefix/namespaces/${ns}/tables`,
      `GET /v1/lake-prefix/namespaces/${ns}/tables/os_crm_contacts`,
      `POST /v1/lake-prefix/namespaces/${ns}/tables/os_crm_contacts`,
    ])
    expect(cat.requests.every((r) => r.auth === 'Bearer tok-123')).toBe(true)
    expect(cat.requests[2]!.body).toEqual({
      namespace: ['analytics', 'opensteward'],
      properties: {},
    })
    const create = cat.requests[4]!.body!
    expect(create).toMatchObject({
      name: 'os_crm_contacts',
      location: 's3://lake/iceberg/analytics/opensteward/os_crm_contacts',
      'stage-create': false,
      properties: {
        'format-version': '2',
        'schema.name-mapping.default': nameMapping(initialIcebergFields()),
        'opensteward.layout': 'iceberg-ready',
      },
    })
    expect((create['schema'] as { fields: unknown[] }).fields).toEqual(initialIcebergFields())
    expect(initialIcebergFields().find((f) => f.name === 'changed_at')).toMatchObject({
      id: 8,
      type: 'timestamptz',
    })

    // Schema evolution — of the deduped batch's fields (the newer `a` has no
    // `name`) — guarded, with the name mapping updated.
    const commit = cat.requests[6]!.body!
    expect(commit['requirements']).toEqual([
      { type: 'assert-table-uuid', uuid: 'uuid-1' },
      { type: 'assert-current-schema-id', 'current-schema-id': 0 },
    ])
    const updates = commit['updates'] as Array<Record<string, unknown>>
    expect(updates.map((u) => u['action'])).toEqual([
      'add-schema',
      'set-current-schema',
      'set-properties',
    ])
    const newFields = (
      updates[0]!['schema'] as { fields: Array<Record<string, unknown>> }
    ).fields.slice(11)
    expect(newFields).toEqual([{ id: 12, name: 'score', required: false, type: 'long' }])
    expect(updates[0]!['last-column-id']).toBe(12)
    expect(
      JSON.parse(
        (updates[2]!['updates'] as Record<string, string>)['schema.name-mapping.default']!,
      ),
    ).toContainEqual({ 'field-id': 12, names: ['score'] })
    expect(updates[1]).toEqual({ action: 'set-current-schema', 'schema-id': -1 })

    // The data file: its own batch directory, typed, microsecond timestamps, kept.
    const dataPath = 'analytics/opensteward/os_crm_contacts/data/batch_b1/00000.parquet'
    expect(store.written).toEqual([
      dataPath,
      'analytics/opensteward/os_crm_contacts/_opensteward/pending/b1.json',
    ])
    expect(store.deleted).toEqual([])
    const data = await readParquetRows(store.files.get(dataPath)!.bytes)
    expect(data.columns.find((c) => c.name === 'changed_at')!.type).toMatch(/MICROSECOND/)
    expect(data.columns.find((c) => c.name === 'score')!.type).toMatch(/Int64/)
    expect(data.rows).toHaveLength(1)
    expect(data.rows[0]).toMatchObject({
      resource_id: 'a',
      score: 4n,
      changed_at: 1_700_000_000_456,
    })

    const manifest = JSON.parse(
      new TextDecoder().decode(
        store.files.get('analytics/opensteward/os_crm_contacts/_opensteward/pending/b1.json')!
          .bytes,
      ),
    )
    expect(manifest).toMatchObject({
      version: 1,
      format: 'iceberg-ready',
      experimental: true,
      kind: 'rows',
      table: {
        namespace: ['analytics', 'opensteward'],
        name: 'os_crm_contacts',
        location: 's3://lake/iceberg/analytics/opensteward/os_crm_contacts',
      },
      schemaId: 1,
      directory: 's3://lake/iceberg/analytics/opensteward/os_crm_contacts/data/batch_b1/',
      files: [
        {
          path: `s3://lake/iceberg/${dataPath}`,
          format: 'PARQUET',
          recordCount: 1,
          fileSizeInBytes: store.files.get(dataPath)!.bytes.byteLength,
        },
      ],
      createdAt: '2026-09-29T00:00:00.000Z',
    })
    // Never a snapshot commit.
    for (const r of cat.requests) {
      for (const u of (r.body?.['updates'] as Array<Record<string, unknown>> | undefined) ?? []) {
        expect(['add-snapshot', 'set-snapshot-ref']).not.toContain(u['action'])
      }
    }
  })

  it('retries a schema update after a concurrent change, keeping the other field', async () => {
    const cat = fakeCatalog({ conflictOnce: true })
    const store = fakeObjectStore()
    const sink = await createIcebergLoader(
      CONFIG,
      {},
      {
        hostGuard: allowAll,
        sink: store,
        fetch: cat.fetch,
        newId: ids('r'),
      },
    )
    await sink.applyBatch(TARGET, [row('a', 1, { city: 'Oslo' })], [])
    const commits = cat.requests.filter(
      (r) => r.method === 'POST' && r.path.endsWith('/os_crm_contacts'),
    )
    expect(commits).toHaveLength(2)
    expect(commits[1]!.body!['requirements']).toContainEqual({
      type: 'assert-current-schema-id',
      'current-schema-id': 1,
    })
    const fields = (
      (commits[1]!.body!['updates'] as Array<Record<string, unknown>>)[0]!['schema'] as {
        fields: Array<{ id: number; name: string }>
      }
    ).fields
    expect(fields.slice(11)).toEqual([
      { id: 12, name: 'other', required: false, type: 'string' },
      { id: 13, name: 'city', required: false, type: 'string' },
    ])
    expect(cat.requests.every((r) => r.auth === undefined)).toBe(true)
  })

  it('logs every tombstone to the table’s _deletes/ and records it as pending', async () => {
    const cat = fakeCatalog()
    const store = fakeObjectStore()
    const sink = await createIcebergLoader(
      CONFIG,
      {},
      {
        hostGuard: allowAll,
        sink: store,
        fetch: cat.fetch,
        newId: ids('d'),
      },
    )
    // No table yet: deletes are skipped.
    expect(await sink.applyBatch(TARGET, [], [del({ scope: 'all' })])).toEqual({
      upserted: 0,
      deleted: 0,
    })
    await sink.applyBatch(TARGET, [row('a', 1)], [])
    const res = await sink.applyBatch(
      TARGET,
      [],
      [
        del({ pk: 'crm:hubspot:c1:contacts:a', deletedAt: 5 }),
        del({ scope: 'connection', deletedAt: 6 }),
      ],
    )
    expect(res).toEqual({ upserted: 0, deleted: 2 })
    const delPath = store.written.find((p) => p.includes('/_deletes/'))!
    expect(delPath).toMatch(
      /^analytics\/opensteward\/os_crm_contacts\/_deletes\/batch_d\d+\.parquet$/,
    )
    const deletes = await readParquetRows(store.files.get(delPath)!.bytes)
    expect(deletes.rows.map((r) => r['scope'])).toEqual(['record', 'connection'])
    const pending = store.written.filter((p) => p.includes('/pending/'))
    expect(pending).toHaveLength(2)
    const last = JSON.parse(new TextDecoder().decode(store.files.get(pending[1]!)!.bytes))
    expect(last).toMatchObject({ kind: 'deletes', files: [{ recordCount: 2 }] })
  })

  it('fails with the catalog’s message and never follows redirects', async () => {
    const store = fakeObjectStore()
    const sink = await createIcebergLoader(
      CONFIG,
      { token: 't' },
      {
        hostGuard: allowAll,
        sink: store,
        fetch: async () =>
          new Response(
            JSON.stringify({
              error: { message: 'Not authorized', type: 'NotAuthorizedException' },
            }),
            {
              status: 403,
            },
          ),
      },
    )
    await expect(sink.applyBatch(TARGET, [row('a', 1)], [])).rejects.toThrow(
      'Iceberg catalog config failed (HTTP 403): Not authorized',
    )
    await expect(sink.test()).rejects.toThrow(/HTTP 403/)
    await expect(
      createIcebergLoader(
        CONFIG,
        {},
        {
          hostGuard: async () => {
            throw new Error('blocked')
          },
          sink: store,
        },
      ),
    ).rejects.toThrow('blocked')
  })
})
