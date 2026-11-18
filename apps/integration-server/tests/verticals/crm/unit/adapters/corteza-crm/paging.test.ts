/**
 * Corteza record lists: numeric namespace/module IDs looked up by slug and
 * handle, then the caller's 1-based `page` and `limit` walked over Corteza's
 * `pageCursor` chain.
 *
 * From the vendor's docs (fetched 2026-09-25):
 *
 *   integrator-guide/accessing-corteza/examples/compose-records.html
 *     "To search over records for a specific module, use the GET
 *      $BASE_URL/compose/namespace/$NAMESPACE_ID/module/$MODULE_ID/record/
 *      endpoint."
 *   integrator-guide/accessing-corteza/pagination.html
 *     "nextPage (string) specifies the next page (omitted if there is no next
 *      page)." ... "When you wish to access a specific page, you must provide
 *      the pageCursor=$PAGE_CURSOR query parameter. When accessing the next
 *      page, $PAGE_CURSOR is filter.nextPage"
 *   /api/docs/compose.yaml (served by every instance)
 *     GET /compose/namespace/ — "slug: Search by namespace slug"
 *     GET /compose/namespace/{namespaceID}/module/ — "handle: Search by handle"
 *     record list — query, meta, deleted, limit, incTotal, incPageNavigation,
 *     pageCursor, sort; path params "Namespace ID", "Module ID"
 *   server/compose/rest/record.go (2024.9.x)
 *     maxRecordSearchSize = 1000, clamped silently
 *
 * The fake below serves only those routes and parameters, answers a slug or
 * handle in an ID segment with the server's invalid-ID error, and clamps
 * `limit` the way the server does.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { CortezaCrmAdapter } from '../../../../../../src/verticals/crm/adapters/corteza-crm/index'

const ORIGIN = 'https://corteza.example.com'
const CREDS = { accessToken: 'jwt', refreshToken: 'rt', extra: { baseUrl: ORIGIN } }
const NS_ID = '100000000000000001'

type Method = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities' | 'listNotes'

const CASES: { method: Method; handle: string; moduleID: string }[] = [
  { method: 'listContacts', handle: 'Contact', moduleID: '200000000000000001' },
  { method: 'listCompanies', handle: 'Account', moduleID: '200000000000000002' },
  { method: 'listDeals', handle: 'Opportunity', moduleID: '200000000000000003' },
  { method: 'listActivities', handle: 'Task', moduleID: '200000000000000004' },
  { method: 'listNotes', handle: 'Note', moduleID: '200000000000000005' },
]

const NAMESPACE_PARAMS = new Set([
  'query',
  'slug',
  'limit',
  'incTotal',
  'labels',
  'pageCursor',
  'sort',
])
const MODULE_PARAMS = new Set([
  'query',
  'name',
  'handle',
  'limit',
  'incTotal',
  'pageCursor',
  'labels',
  'sort',
])
const RECORD_PARAMS = new Set([
  'query',
  'meta',
  'deleted',
  'limit',
  'incTotal',
  'incPageNavigation',
  'pageCursor',
  'sort',
])

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

interface Fake {
  sent: URL[]
  records: URL[]
}

/** A Corteza instance holding `total` records in module `handle` of namespace `crm`. */
function fakeCorteza(handle: string, moduleID: string, total: number): Fake {
  const sent: URL[] = []
  const records: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    sent.push(url)
    if ((init?.method ?? 'GET') !== 'GET') return json({ error: { message: 'method' } }, 405)
    if (url.origin !== ORIGIN) return json({ error: { message: 'host' } }, 404)
    const check = (allowed: Set<string>) =>
      [...url.searchParams.keys()].find((k) => !allowed.has(k))

    if (url.pathname === '/api/compose/namespace/') {
      const bad = check(NAMESPACE_PARAMS)
      if (bad) return json({ error: { message: `unknown param ${bad}` } }, 400)
      const slug = url.searchParams.get('slug')
      const set =
        slug === null || slug === 'crm' ? [{ namespaceID: NS_ID, slug: 'crm', name: 'CRM' }] : []
      return json({ response: { filter: { slug: slug ?? '' }, set } })
    }

    const mod = url.pathname.match(/^\/api\/compose\/namespace\/([^/]+)\/module\/$/)
    if (mod) {
      if (!/^\d+$/.test(mod[1]!)) return json({ error: { message: 'invalid namespace ID' } }, 400)
      if (mod[1] !== NS_ID) return json({ response: { filter: {}, set: [] } })
      const bad = check(MODULE_PARAMS)
      if (bad) return json({ error: { message: `unknown param ${bad}` } }, 400)
      const h = url.searchParams.get('handle')
      const set = h === null || h === handle ? [{ moduleID, handle, namespaceID: NS_ID }] : []
      return json({ response: { filter: { handle: h ?? '' }, set } })
    }

    const rec = url.pathname.match(
      /^\/api\/compose\/namespace\/([^/]+)\/module\/([^/]+)\/record\/$/,
    )
    if (rec) {
      if (!/^\d+$/.test(rec[1]!)) return json({ error: { message: 'invalid namespace ID' } }, 400)
      if (!/^\d+$/.test(rec[2]!)) return json({ error: { message: 'invalid module ID' } }, 400)
      if (rec[1] !== NS_ID || rec[2] !== moduleID) {
        return json({ error: { message: 'module not found' } }, 404)
      }
      const bad = check(RECORD_PARAMS)
      if (bad) return json({ error: { message: `unknown param ${bad}` } }, 400)
      records.push(url)
      const raw = Number(url.searchParams.get('limit') ?? '0')
      const limit = raw === 0 ? 500 : Math.min(raw, 1000)
      const cursor = url.searchParams.get('pageCursor')
      const offset = cursor === null ? 0 : Number(Buffer.from(cursor, 'base64').toString())
      const end = Math.min(offset + limit, total)
      const set = Array.from({ length: end - offset }, (_, i) => ({
        recordID: String(300000000000000000n + BigInt(offset + i + 1)),
        moduleID,
        namespaceID: NS_ID,
        values: [{ name: 'Name', value: `r${offset + i + 1}` }],
      }))
      const filter: Record<string, unknown> = { moduleID, namespaceID: NS_ID, limit }
      if (end < total) filter['nextPage'] = Buffer.from(String(end)).toString('base64')
      return json({ response: { filter, set } })
    }
    return json({ error: { message: `no route ${url.pathname}` } }, 404)
  })
  return { sent, records }
}

const ids = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => String(300000000000000000n + BigInt(from + i)))

async function call(
  adapter: CortezaCrmAdapter,
  method: Method,
  params: QueryParams,
): Promise<{ id: string }[]> {
  return (await adapter[method](CREDS, params)) as { id: string }[]
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('corteza-crm $method paging', ({ method, handle, moduleID }) => {
  it('pages 1..3 of 2L+1 records return every id once, in order, with exact hasMore', async () => {
    const L = 5
    const { records } = fakeCorteza(handle, moduleID, 2 * L + 1)
    const adapter = new CortezaCrmAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call(adapter, method, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
    expect(records).toHaveLength(3)
    expect(records.every((u) => u.searchParams.get('limit') === String(L))).toBe(true)
  })

  it('reads the list at numeric IDs found by slug and handle', async () => {
    const { sent, records } = fakeCorteza(handle, moduleID, 3)
    await call(new CortezaCrmAdapter(), method, withPageSink({ page: 1, limit: 10 }))
    expect(sent[0]!.pathname).toBe('/api/compose/namespace/')
    expect(sent[0]!.searchParams.get('slug')).toBe('crm')
    expect(sent[1]!.pathname).toBe(`/api/compose/namespace/${NS_ID}/module/`)
    expect(sent[1]!.searchParams.get('handle')).toBe(handle)
    expect(records[0]!.pathname).toBe(`/api/compose/namespace/${NS_ID}/module/${moduleID}/record/`)
  })

  it('page 2 carries filter.nextPage as pageCursor, and page 1 carries none', async () => {
    const { records } = fakeCorteza(handle, moduleID, 11)
    const adapter = new CortezaCrmAdapter()
    await call(adapter, method, withPageSink({ page: 1, limit: 5 }))
    await call(adapter, method, withPageSink({ page: 2, limit: 5 }))
    expect(records[0]!.searchParams.get('pageCursor')).toBeNull()
    expect(records[1]!.searchParams.get('pageCursor')).toBe(Buffer.from('5').toString('base64'))
  })

  it('looks the IDs up once per connection, not once per page', async () => {
    const { sent } = fakeCorteza(handle, moduleID, 11)
    const adapter = new CortezaCrmAdapter()
    await call(adapter, method, withPageSink({ page: 1, limit: 5 }))
    await call(adapter, method, withPageSink({ page: 2, limit: 5 }))
    const lookups = sent.filter((u) => !u.pathname.endsWith('/record/'))
    expect(lookups).toHaveLength(2)
  })

  it('a jump straight to page 3 walks the cursor chain', async () => {
    const { records } = fakeCorteza(handle, moduleID, 11)
    const rows = await call(new CortezaCrmAdapter(), method, withPageSink({ page: 3, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(ids(11, 1))
    expect(records).toHaveLength(3)
  })

  it('clamps a limit above 1000 and reports the size it sent', async () => {
    const { records } = fakeCorteza(handle, moduleID, 1500)
    const params = withPageSink({ page: 1, limit: 5000 })
    const rows = await call(new CortezaCrmAdapter(), method, params)
    expect(records[0]!.searchParams.get('limit')).toBe('1000')
    expect(rows).toHaveLength(1000)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 1000 })
  })

  it('an exact multiple of the limit ends with hasMore false on the last full page', async () => {
    fakeCorteza(handle, moduleID, 10)
    const adapter = new CortezaCrmAdapter()
    const p1 = withPageSink({ page: 1, limit: 5 })
    const p2 = withPageSink({ page: 2, limit: 5 })
    await call(adapter, method, p1)
    expect(await call(adapter, method, p2)).toHaveLength(5)
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })
})

describe('corteza-crm ID lookup failures', () => {
  it('a missing namespace is a 404 naming the slug, and no record request is sent', async () => {
    const { records } = fakeCorteza('Contact', CASES[0]!.moduleID, 3)
    const adapter = new CortezaCrmAdapter({ namespaceSlug: 'sales' })
    await expect(
      adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining("slug 'sales'"),
    })
    expect(records).toHaveLength(0)
  })

  it('a missing module is a 404 naming the handle, and no record request is sent', async () => {
    const { records } = fakeCorteza('Lead', '200000000000000009', 3)
    await expect(
      new CortezaCrmAdapter().listContacts(CREDS, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining("handle 'Contact'"),
    })
    expect(records).toHaveLength(0)
  })

  it('a failed lookup is retried on the next call, not remembered', async () => {
    const { sent } = fakeCorteza('Lead', '200000000000000009', 3)
    const adapter = new CortezaCrmAdapter()
    await adapter.listContacts(CREDS, {}).catch(() => undefined)
    await adapter.listContacts(CREDS, {}).catch(() => undefined)
    expect(sent.filter((u) => u.pathname === '/api/compose/namespace/')).toHaveLength(2)
  })
})

describe('corteza-crm ID lookup matching', () => {
  it('takes only the namespace and module whose slug and handle match exactly', async () => {
    const sent: URL[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      sent.push(url)
      if (url.pathname === '/api/compose/namespace/') {
        return json({
          response: {
            filter: {},
            set: [
              { namespaceID: '111', slug: 'crm-archive' },
              { namespaceID: NS_ID, slug: 'crm' },
            ],
          },
        })
      }
      if (url.pathname === `/api/compose/namespace/${NS_ID}/module/`) {
        return json({
          response: {
            filter: {},
            set: [
              { moduleID: '222', handle: 'ContactRole' },
              { moduleID: '333', handle: 'Contact' },
            ],
          },
        })
      }
      return json({ response: { filter: {}, set: [] } })
    })
    await new CortezaCrmAdapter().listContacts(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(sent.at(-1)!.pathname).toBe(`/api/compose/namespace/${NS_ID}/module/333/record/`)
  })
})

describe('corteza-crm get by id', () => {
  it('reads one record at the resolved numeric IDs', async () => {
    const moduleID = '200000000000000001'
    const sent: URL[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      sent.push(url)
      if (url.pathname === '/api/compose/namespace/') {
        return json({ response: { filter: {}, set: [{ namespaceID: NS_ID, slug: 'crm' }] } })
      }
      if (url.pathname === `/api/compose/namespace/${NS_ID}/module/`) {
        return json({ response: { filter: {}, set: [{ moduleID, handle: 'Contact' }] } })
      }
      if (url.pathname === `/api/compose/namespace/${NS_ID}/module/${moduleID}/record/42`) {
        return json({
          response: {
            recordID: '42',
            moduleID,
            namespaceID: NS_ID,
            values: [{ name: 'FirstName', value: 'Ada' }],
          },
        })
      }
      return json({ error: { message: 'no route' } }, 404)
    })
    const contact = await new CortezaCrmAdapter().getContact(CREDS, '42')
    expect(contact).toMatchObject({ id: '42', first_name: 'Ada' })
    expect(sent.at(-1)!.pathname).toBe(
      `/api/compose/namespace/${NS_ID}/module/${moduleID}/record/42`,
    )
  })
})

describe('corteza-crm caches', () => {
  it('two modules on one connection each read their own module ID', async () => {
    const contactID = CASES[0]!.moduleID
    const accountID = CASES[1]!.moduleID
    const records: URL[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === '/api/compose/namespace/') {
        return json({ response: { filter: {}, set: [{ namespaceID: NS_ID, slug: 'crm' }] } })
      }
      if (url.pathname === `/api/compose/namespace/${NS_ID}/module/`) {
        const h = url.searchParams.get('handle')
        const moduleID = h === 'Contact' ? contactID : h === 'Account' ? accountID : undefined
        const set = moduleID ? [{ moduleID, handle: h }] : []
        return json({ response: { filter: {}, set } })
      }
      records.push(url)
      return json({ response: { filter: {}, set: [] } })
    })
    const adapter = new CortezaCrmAdapter()
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 5 }))
    await adapter.listCompanies(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(records.map((u) => u.pathname)).toEqual([
      `/api/compose/namespace/${NS_ID}/module/${contactID}/record/`,
      `/api/compose/namespace/${NS_ID}/module/${accountID}/record/`,
    ])
  })

  it('a walk at a new limit starts its own cursor chain', async () => {
    const { handle, moduleID } = CASES[0]!
    const { records } = fakeCorteza(handle, moduleID, 20)
    const adapter = new CortezaCrmAdapter()
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 5 }))
    const rows = await adapter.listContacts(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(ids(4, 3))
    expect(records.at(-1)!.searchParams.get('limit')).toBe('3')
  })
})

describe('corteza-crm request details', () => {
  it('a call without a limit sends 25 and reports that size', async () => {
    const { handle, moduleID } = CASES[0]!
    const { records } = fakeCorteza(handle, moduleID, 30)
    const params = withPageSink({ page: 1 })
    const rows = await new CortezaCrmAdapter().listContacts(CREDS, params)
    expect(records[0]!.searchParams.get('limit')).toBe('25')
    expect(rows).toHaveLength(25)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 25 })
  })

  it('a record id is sent as one encoded path segment', async () => {
    const moduleID = CASES[0]!.moduleID
    const sent: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const raw = String(input)
      sent.push(raw)
      const url = new URL(raw)
      if (url.pathname === '/api/compose/namespace/') {
        return json({ response: { filter: {}, set: [{ namespaceID: NS_ID, slug: 'crm' }] } })
      }
      if (url.pathname === `/api/compose/namespace/${NS_ID}/module/`) {
        return json({ response: { filter: {}, set: [{ moduleID, handle: 'Contact' }] } })
      }
      return json({ error: { message: 'no route' } }, 404)
    })
    await new CortezaCrmAdapter().getContact(CREDS, '42/../x?y').catch(() => undefined)
    expect(sent.at(-1)).toBe(
      `${ORIGIN}/api/compose/namespace/${NS_ID}/module/${moduleID}/record/42%2F..%2Fx%3Fy`,
    )
  })
})
