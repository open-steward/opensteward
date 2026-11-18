/**
 * Spiro reads: host, headers, paths, paging and the end signal, against a fake
 * that honours ONLY what Spiro's OpenAPI spec documents
 * (https://developers.spiro.ai/api/docs/v1/openapi.json):
 *
 *   host:     "Example: `GET https://api.spiro.ai/api/v1/contacts?filter[first_name_eq]=John`"
 *   headers:  "Each request must be accompanied by the following headers:
 *              `Accept application/vnd.api+json` `Authorization Bearer [YOUR TOKEN]`
 *              `Content-type application/vnd.api+json`"
 *   paging:   every list endpoint takes `page[number]` ("Page number") and
 *             `page[size]` ("Page size"), and answers
 *             `meta.pagination { current_page, per_page, total_pages, next_page }`,
 *             `next_page: null` on the last page. No maximum size is documented.
 *   filters:  "Each resource may be filtered by any of its attributes using the
 *             available predicates ... `filter[{{attribute}}_{{predicate}}]={{value}}`",
 *             `*_eq` = "equal"; `id` is an attribute of every resource here.
 *   paths:    /api/v1/contacts, /api/v1/contacts/{id}, /api/v1/companies,
 *             /api/v1/companies/{id}, /api/v1/opportunities, /api/v1/opportunities/{id},
 *             /api/v1/pipelines, /api/v1/pipelines/{pipeline_id}/opportunity_stages,
 *             /api/v1/activities, /api/v1/notes. /api/v1/people is not in the spec.
 *
 * Anything else — another host, another path, a `page`/`page_size` query, a
 * missing JSON:API header — gets an error, as engine.spiro.ai's 422 "Invalid
 * Version" did for the adapter's old requests.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { SpiroAdapter } from '../../../../../../src/verticals/crm/adapters/spiro/index'

const CREDS = { accessToken: 'spiro_test_token', refreshToken: 'spiro_refresh' }
const MEDIA = 'application/vnd.api+json'
/** The per_page Spiro's list examples show when no size is sent. */
const SERVER_DEFAULT_SIZE = 25

type Row = {
  id: string
  type: string
  attributes: Record<string, unknown>
  relationships?: unknown
}

const LISTS: Record<string, string> = {
  '/api/v1/contacts': 'contact',
  '/api/v1/companies': 'company',
  '/api/v1/opportunities': 'opportunity',
  '/api/v1/pipelines': 'pipeline',
  '/api/v1/activities': 'activity',
  '/api/v1/notes': 'note',
}
const GETS = new Set(['/api/v1/contacts', '/api/v1/companies', '/api/v1/opportunities'])
const DOCUMENTED_QUERY = new Set(['page[number]', 'page[size]', 'filter[id_eq]'])

function attributesFor(type: string, n: number): Record<string, unknown> {
  const stamp = '2026-09-01T09:57:38.521Z'
  switch (type) {
    case 'contact':
      return {
        id: n,
        first_name: `F${n}`,
        last_name: null,
        created_at: stamp,
        updated_at: stamp,
        title: null,
        phone: null,
        mobile_phone: null,
        home_phone: null,
        email: null,
        description: null,
        custom: {},
        external_id: null,
        email_opt_out: false,
      }
    case 'company':
      return {
        id: n,
        name: `Co ${n}`,
        website: null,
        address: null,
        city: null,
        zipcode: null,
        parent_id: null,
        country: null,
        state: null,
        phone: null,
        description: null,
        custom: {},
        created_at: stamp,
        updated_at: stamp,
        external_id: null,
      }
    case 'opportunity':
      return {
        id: n,
        name: `Opp ${n}`,
        close_at: null,
        amount: null,
        updated_at: stamp,
        description: null,
        custom: {},
        external_id: null,
        currency: null,
        created_at: stamp,
      }
    case 'pipeline':
      return { id: n, name: `Pipeline ${n}`, is_active: true, index: 0 }
    case 'activity':
      return {
        id: n,
        interacted_at: stamp,
        subject: `S${n}`,
        description: null,
        status: null,
        disposition: null,
        call_status: null,
        result: 0,
        custom: {},
        external_id: null,
        custom_activity_type: null,
        call_duration: null,
      }
    default:
      return {
        id: n,
        subject: `S${n}`,
        description: `Body ${n}`,
        interacted_at: stamp,
        custom: {},
        external_id: null,
      }
  }
}

interface FakeOpts {
  /** Rows per collection. */
  total: number
  /** Serve at most this many rows per page, whatever size was asked. */
  serverMax?: number
  /** Stages per pipeline, and the stage endpoint's page size (server default). */
  stages?: number
  stagePageSize?: number
}

function fakeSpiro(opts: FakeOpts) {
  const requests: URL[] = []
  const collections = new Map<string, Row[]>()
  for (const [path, type] of Object.entries(LISTS)) {
    collections.set(
      path,
      Array.from({ length: opts.total }, (_, i) => ({
        id: String(i + 1),
        type,
        attributes: attributesFor(type, i + 1),
      })),
    )
  }
  const err = (status: number, msg: string) =>
    new Response(JSON.stringify({ message: msg }), { status })
  const page = (rows: Row[], pageNumber: number, size: number) => {
    const totalPages = Math.max(1, Math.ceil(rows.length / size))
    return new Response(
      JSON.stringify({
        data: rows.slice((pageNumber - 1) * size, pageNumber * size),
        meta: {
          pagination: {
            current_page: pageNumber,
            per_page: size,
            total_pages: totalPages,
            next_page: pageNumber < totalPages ? pageNumber + 1 : null,
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': `${MEDIA}; charset=utf-8` } },
    )
  }

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    requests.push(url)
    if (url.origin !== 'https://api.spiro.ai') return err(422, 'Invalid Version')
    const h = new Headers(init?.headers)
    if (h.get('Authorization') !== `Bearer ${CREDS.accessToken}`) return err(401, 'invalid_token')
    if (h.get('Accept') !== MEDIA || h.get('Content-Type') !== MEDIA) return err(406, 'media type')
    if ((init?.method ?? 'GET') !== 'GET') return err(405, 'method')
    for (const k of url.searchParams.keys()) {
      if (!DOCUMENTED_QUERY.has(k)) return err(400, `undocumented query ${k}`)
    }
    const num = url.searchParams.get('page[number]')
    const sz = url.searchParams.get('page[size]')
    const pageNumber = num == null ? 1 : Number(num)
    const asked = sz == null ? SERVER_DEFAULT_SIZE : Number(sz)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return err(400, 'page[number]')
    if (!Number.isInteger(asked) || asked < 1) return err(400, 'page[size]')

    const stages = /^\/api\/v1\/pipelines\/([^/]+)\/opportunity_stages$/.exec(url.pathname)
    if (stages) {
      const pid = decodeURIComponent(stages[1])
      const rows: Row[] = Array.from({ length: opts.stages ?? 0 }, (_, i) => ({
        id: `${pid}-s${i + 1}`,
        type: 'opportunity_stage',
        attributes: {
          id: i + 1,
          name: `P${pid} stage ${i + 1}`,
          is_closed: false,
          is_won: false,
          is_active: true,
          index: i + 1,
          created_at: '2026-09-01T09:57:39.544Z',
        },
      }))
      const size = sz == null ? (opts.stagePageSize ?? SERVER_DEFAULT_SIZE) : asked
      return page(rows, pageNumber, size)
    }

    const list = collections.get(url.pathname)
    if (list) {
      const idEq = url.searchParams.get('filter[id_eq]')
      const rows = idEq == null ? list : list.filter((r) => r.attributes['id'] === Number(idEq))
      return page(rows, pageNumber, Math.min(asked, opts.serverMax ?? Infinity))
    }
    const one = /^(\/api\/v1\/[a-z_]+)\/([^/]+)$/.exec(url.pathname)
    if (one && GETS.has(one[1])) {
      if ([...url.searchParams.keys()].length > 0) return err(400, 'query on get')
      const row = collections.get(one[1])!.find((r) => r.id === decodeURIComponent(one[2]))
      return row
        ? new Response(JSON.stringify({ data: row }), { status: 200 })
        : err(404, 'not found')
    }
    return err(404, `no such path ${url.pathname}`)
  })
  return { requests }
}

afterEach(() => vi.restoreAllMocks())

type Lister = (a: SpiroAdapter, p: QueryParams) => Promise<Array<{ id: string }>>
const LISTERS: Array<[string, string, Lister]> = [
  ['listContacts', '/api/v1/contacts', (a, p) => a.listContacts(CREDS, p)],
  ['listCompanies', '/api/v1/companies', (a, p) => a.listCompanies(CREDS, p)],
  ['listDeals', '/api/v1/opportunities', (a, p) => a.listDeals(CREDS, p)],
  ['listPipelines', '/api/v1/pipelines', (a, p) => a.listPipelines(CREDS, p)],
  ['listActivities', '/api/v1/activities', (a, p) => a.listActivities(CREDS, p)],
  ['listNotes', '/api/v1/notes', (a, p) => a.listNotes(CREDS, p)],
]

describe.each(LISTERS)('spiro %s', (_name, path, list) => {
  const L = 3
  const N = 2 * L + 1

  it(`walks ${N} rows at limit ${L}: every id once, hasMore exact`, async () => {
    fakeSpiro({ total: N })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(new SpiroAdapter(), params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(rows.length).toBe(page < 3 ? L : 1)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(more).toEqual([true, true, false])
  })

  it(`sends page[number] + the caller's exact page[size] to https://api.spiro.ai${path}`, async () => {
    const { requests } = fakeSpiro({ total: 500 })
    await list(new SpiroAdapter(), withPageSink({ page: 4, limit: 137 }))
    const url = requests[0]
    expect(url.origin + url.pathname).toBe(`https://api.spiro.ai${path}`)
    expect(url.searchParams.get('page[number]')).toBe('4')
    expect(url.searchParams.get('page[size]')).toBe('137')
    expect(url.searchParams.has('page')).toBe(false)
    expect(url.searchParams.has('page_size')).toBe(false)
  })

  it('sends page 1 and no size when the caller gives neither', async () => {
    const { requests } = fakeSpiro({ total: 5 })
    await list(new SpiroAdapter(), {})
    expect(requests[0].searchParams.get('page[number]')).toBe('1')
    expect(requests[0].searchParams.has('page[size]')).toBe(false)
  })

  it('reports the smaller per_page Spiro served, so a full page is not read as the last', async () => {
    fakeSpiro({ total: 100, serverMax: 10 })
    const params = withPageSink({ page: 1, limit: 50 })
    const rows = await list(new SpiroAdapter(), params)
    expect(rows).toHaveLength(10)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 10 })
  })

  it('reports no pageSize when Spiro served the size asked', async () => {
    fakeSpiro({ total: 100 })
    const params = withPageSink({ page: 1, limit: 50 })
    await list(new SpiroAdapter(), params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })
})

describe('spiro contacts are /api/v1/contacts, never the undocumented /api/v1/people', () => {
  it('listContacts and getContact', async () => {
    const { requests } = fakeSpiro({ total: 3 })
    const a = new SpiroAdapter()
    await a.listContacts(CREDS, { page: 1, limit: 3 })
    const c = await a.getContact(CREDS, '2')
    expect(c.id).toBe('2')
    expect(requests.map((u) => u.pathname)).toEqual(['/api/v1/contacts', '/api/v1/contacts/2'])
  })
})

describe('spiro get by documented path', () => {
  it.each([
    ['getCompany', '/api/v1/companies/3', (a: SpiroAdapter) => a.getCompany(CREDS, '3')],
    ['getDeal', '/api/v1/opportunities/3', (a: SpiroAdapter) => a.getDeal(CREDS, '3')],
  ])('%s reads the JSON:API document', async (_n, path, get) => {
    const { requests } = fakeSpiro({ total: 5 })
    const row = await get(new SpiroAdapter())
    expect(row.id).toBe('3')
    expect(requests.map((u) => u.pathname)).toEqual([path])
  })
})

describe('spiro get through filter[id_eq] where no GET-by-id is documented', () => {
  it.each([
    [
      'getActivity',
      '/api/v1/activities',
      (a: SpiroAdapter, id: string) => a.getActivity(CREDS, id),
    ],
    ['getNote', '/api/v1/notes', (a: SpiroAdapter, id: string) => a.getNote(CREDS, id)],
    ['getPipeline', '/api/v1/pipelines', (a: SpiroAdapter, id: string) => a.getPipeline(CREDS, id)],
  ])('%s finds the one record, and 404s on an id Spiro does not have', async (_n, path, get) => {
    const { requests } = fakeSpiro({ total: 40 })
    const row = await get(new SpiroAdapter(), '37')
    expect(row.id).toBe('37')
    expect(requests[0].pathname).toBe(path)
    expect(requests[0].searchParams.get('filter[id_eq]')).toBe('37')
    await expect(get(new SpiroAdapter(), '999')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('spiro pipeline stages', () => {
  it("reads every page of each pipeline's opportunity_stages, following next_page", async () => {
    const { requests } = fakeSpiro({ total: 2, stages: 5, stagePageSize: 2 })
    const pipelines = await new SpiroAdapter().listPipelines(CREDS, { page: 1, limit: 2 })
    expect(pipelines.map((p) => p.stages?.map((s) => s.id))).toEqual([
      ['1-s1', '1-s2', '1-s3', '1-s4', '1-s5'],
      ['2-s1', '2-s2', '2-s3', '2-s4', '2-s5'],
    ])
    const stageCalls = requests.filter(
      (u) => u.pathname === '/api/v1/pipelines/1/opportunity_stages',
    )
    expect(stageCalls.map((u) => u.searchParams.get('page[number]'))).toEqual(['1', '2', '3'])
  })
})

describe('spiro OAuth scope', () => {
  // "set `Scopes` to `admin`" ... "No finer-grained scopes are available at this time."
  it('asks for the one documented scope, admin', () => {
    const url = new URL(
      new SpiroAdapter({ clientId: 'cid', redirectUri: 'https://app.example/cb' }).getAuthUrl('st'),
    )
    expect(url.searchParams.get('scope')).toBe('admin')
  })
})

describe('spiro pipeline stages: bounded and terminating', () => {
  it('fetches one pipeline’s stages at a time, never a request per pipeline at once', async () => {
    fakeSpiro({ total: 6, stages: 2 })
    const inner = vi.mocked(globalThis.fetch).getMockImplementation()!
    let inFlight = 0
    let peak = 0
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      try {
        return await inner(input, init)
      } finally {
        inFlight--
      }
    })
    const pipelines = await new SpiroAdapter().listPipelines(CREDS, { page: 1, limit: 6 })
    expect(pipelines).toHaveLength(6)
    expect(peak).toBe(1)
  })

  it('stops the stage walk when next_page does not move forward', async () => {
    const pipeline = { id: '7', type: 'pipeline', attributes: attributesFor('pipeline', 7) }
    const stage = {
      id: '70',
      type: 'opportunity_stage',
      attributes: {
        id: 70,
        name: 'Only',
        is_closed: false,
        is_won: false,
        is_active: true,
        index: 1,
        created_at: '2026-09-01T09:57:39.544Z',
      },
    }
    let stageCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      const pagination = (next: number | null) => ({
        current_page: 1,
        per_page: 25,
        total_pages: 1,
        next_page: next,
      })
      if (url.pathname === '/api/v1/pipelines') {
        return new Response(
          JSON.stringify({ data: [pipeline], meta: { pagination: pagination(null) } }),
        )
      }
      if (++stageCalls > 3) throw new Error('stage walk did not stop')
      // A next_page that points back at the page just served.
      return new Response(JSON.stringify({ data: [stage], meta: { pagination: pagination(1) } }))
    })
    const [p] = await new SpiroAdapter().listPipelines(CREDS, { page: 1, limit: 1 })
    expect(p.stages).toEqual([{ id: '70', name: 'Only' }])
    expect(stageCalls).toBe(1)
  })
})

describe('spiro filter[id_eq] gets return only the exact id', () => {
  function serve(rows: Row[]) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: rows,
            meta: {
              pagination: { current_page: 1, per_page: 25, total_pages: 1, next_page: null },
            },
          }),
        ),
    )
  }
  const note = (id: number): Row => ({
    id: String(id),
    type: 'note',
    attributes: attributesFor('note', id),
  })

  it('picks the matching row even when it is not first', async () => {
    serve([note(5), note(37)])
    expect((await new SpiroAdapter().getNote(CREDS, '37')).id).toBe('37')
  })

  it('404s when the only row returned is another record', async () => {
    serve([note(5)])
    await expect(new SpiroAdapter().getNote(CREDS, '37')).rejects.toMatchObject({ statusCode: 404 })
  })
})
