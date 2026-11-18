/**
 * Barantum's CRM reads, against a fake that honours only what the docs say.
 *
 * Barantum CRM collection, https://docs.barantum.com/api/collections/23513668/2sBYAuTBr5:
 * "All CRM operations use 4 unified REST endpoints. The target module is
 * specified via the module parameter in the request body. Authentication is
 * done by passing a JWT token in the token field of each request body." A
 * list is `POST https://rest-api.barantum.com/api/get_list_data` with body
 * parameters `token` (Yes), `module` (Yes), `page` (Optional, number) and the
 * module's `<module>_uuid` (Optional). The response is
 * `{ "code": "200", "result": { "total", "page_total", "page_last",
 * "page_first", "per_page": 20, "page_current", "page_previous",
 * "page_next", "content": [...] } }`; the documented one-row example has
 * `"page_last": 1` and `"page_next": 2`, so `page_next` is not an end signal.
 *
 * The fake rejects any other method, host, path, header auth or body key,
 * serves fixed 20-row pages, and fails a request past `page_last`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetRowPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { BarantumAdapter } from '../../../../../../src/verticals/crm/adapters/barantum'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { DealSchema } from '../../../../../../src/verticals/crm/schema/deal'
import { NoteSchema } from '../../../../../../src/verticals/crm/schema/note'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'
import {
  DOC_CALL,
  DOC_CONTACT,
  DOC_DEAL,
  DOC_MEETING,
  DOC_NOTE,
  DOC_ORG,
  DOC_TASK,
} from './fixtures/documented'

const URL_LIST = 'https://rest-api.barantum.com/api/get_list_data'
const JWT = 'eyJhbGciOiJIUzI1NiJ9.test.jwt'
const CREDS: Credentials = { accessToken: JWT }
// A second Barantum account, with its own rows (counts2).
const JWT2 = 'eyJhbGciOiJIUzI1NiJ9.other.jwt'
const CREDS2: Credentials = { accessToken: JWT2 }
const PER_PAGE = 20

type Module = 'Contacts' | 'Org' | 'Deals' | 'Notes' | 'Calls' | 'Meetings' | 'Tasks'

const TEMPLATE: Record<Module, { row: Record<string, unknown>; uuid: string }> = {
  Contacts: { row: DOC_CONTACT, uuid: 'contacts_uuid' },
  Org: { row: DOC_ORG, uuid: 'org_uuid' },
  Deals: { row: DOC_DEAL, uuid: 'deals_uuid' },
  Notes: { row: DOC_NOTE, uuid: 'notes_uuid' },
  Calls: { row: DOC_CALL, uuid: 'calls_uuid' },
  Meetings: { row: DOC_MEETING, uuid: 'meetings_uuid' },
  Tasks: { row: DOC_TASK, uuid: 'tasks_uuid' },
}

let counts: Partial<Record<Module, number>> = {}
let counts2: Partial<Record<Module, number>> = {}
let sent: Array<Record<string, unknown>> = []

function uuidOf(module: Module, i: number): string {
  return `${module.toLowerCase()}-${String(i).padStart(4, '0')}`
}

function rowsOf(module: Module, token: unknown = JWT): Array<Record<string, unknown>> {
  const { row, uuid } = TEMPLATE[module]
  const n = (token === JWT2 ? counts2 : counts)[module] ?? 0
  return Array.from({ length: n }, (_, i) => ({
    ...row,
    [uuid]: uuidOf(module, i + 1),
  }))
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function fakeBarantum(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (String(input) !== URL_LIST || init?.method !== 'POST') return json(404, { code: '404' })
  const headers = new Headers(init.headers)
  if (headers.has('Authorization'))
    return json(400, { code: '400', result: 'auth goes in the body' })
  const body = JSON.parse(String(init.body)) as Record<string, unknown>
  sent.push(body)
  if (body['token'] !== JWT && body['token'] !== JWT2) return json(401, { code: '401' })
  const module = body['module'] as Module
  if (!(module in TEMPLATE)) return json(400, { code: '400' })
  const uuidField = TEMPLATE[module].uuid
  for (const k of Object.keys(body)) {
    if (!['token', 'module', 'page', uuidField].includes(k))
      return json(400, { code: '400', result: `unknown ${k}` })
  }
  let rows = rowsOf(module, body['token'])
  if (body[uuidField] !== undefined) rows = rows.filter((r) => r[uuidField] === body[uuidField])
  const page = body['page'] === undefined ? 1 : Number(body['page'])
  const pageLast = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  if (page > pageLast)
    return json(500, { code: '500', result: `page ${page} is past page_last ${pageLast}` })
  return json(200, {
    code: '200',
    result: {
      total: rows.length,
      page_total: pageLast,
      page_last: pageLast,
      page_first: 1,
      per_page: PER_PAGE,
      page_current: page,
      page_previous: page - 1,
      page_next: page + 1,
      content: rows.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    },
  })
}

beforeEach(() => {
  counts = {}
  counts2 = {}
  sent = []
  _resetRowPager()
  vi.stubGlobal('fetch', vi.fn(fakeBarantum))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new BarantumAdapter()

type ListMethod = 'listContacts' | 'listCompanies' | 'listDeals' | 'listNotes' | 'listActivities'

async function page(method: ListMethod, n: number, limit: number) {
  const params: QueryParams = withPageSink({ page: n, limit })
  const rows = (await adapter[method](CREDS, params)) as Array<{ id: string }>
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

const SINGLE: Array<{
  method: Exclude<ListMethod, 'listActivities'>
  module: Module
  id: (u: string) => string
}> = [
  { method: 'listContacts', module: 'Contacts', id: (u) => u },
  { method: 'listCompanies', module: 'Org', id: (u) => u },
  { method: 'listDeals', module: 'Deals', id: (u) => u },
  { method: 'listNotes', module: 'Notes', id: (u) => u },
]

describe.each(SINGLE)('barantum $method (module $module)', ({ method, module, id }) => {
  const L = 15
  const all = () => Array.from({ length: counts[module] ?? 0 }, (_, i) => id(uuidOf(module, i + 1)))

  it('sends only the documented body: token, module and page', async () => {
    counts[module] = 1
    await page(method, 1, 10)
    expect(sent).toEqual([{ token: JWT, module, page: 1 }])
  })

  it('walks 2L+1 rows over 20-row upstream pages (20 + 11), every id once, hasMore exact', async () => {
    counts[module] = 2 * L + 1
    expect(await page(method, 1, L)).toEqual({ ids: all().slice(0, L), hasMore: true })
    expect(await page(method, 2, L)).toEqual({ ids: all().slice(L, 2 * L), hasMore: true })
    expect(await page(method, 3, L)).toEqual({ ids: all().slice(2 * L), hasMore: false })
    expect(sent.map((b) => b['page'])).toEqual([1, 2])
  })

  it('ends on page_last, not on page_next, when the rows end on an upstream page', async () => {
    counts[module] = PER_PAGE
    expect(await page(method, 1, PER_PAGE)).toEqual({ ids: all(), hasMore: false })
    expect(sent.map((b) => b['page'])).toEqual([1])
  })

  it('reads a later caller page from the upstream page that holds it', async () => {
    counts[module] = 45
    expect(await page(method, 3, 10)).toEqual({ ids: all().slice(20, 30), hasMore: true })
  })
})

describe('barantum listActivities (Calls, then Meetings, then Tasks)', () => {
  const L = 15
  const all = () => [
    ...Array.from({ length: counts.Calls ?? 0 }, (_, i) => `calls:${uuidOf('Calls', i + 1)}`),
    ...Array.from(
      { length: counts.Meetings ?? 0 },
      (_, i) => `meetings:${uuidOf('Meetings', i + 1)}`,
    ),
    ...Array.from({ length: counts.Tasks ?? 0 }, (_, i) => `tasks:${uuidOf('Tasks', i + 1)}`),
  ]

  it('walks 2L+1 rows across uneven module pages (5 | 20 + 1 | 5), every id once, hasMore exact', async () => {
    counts = { Calls: 5, Meetings: 21, Tasks: 5 }
    expect(await page('listActivities', 1, L)).toEqual({ ids: all().slice(0, L), hasMore: true })
    expect(await page('listActivities', 2, L)).toEqual({
      ids: all().slice(L, 2 * L),
      hasMore: true,
    })
    expect(await page('listActivities', 3, L)).toEqual({ ids: all().slice(2 * L), hasMore: false })
    expect(new Set(all()).size).toBe(2 * L + 1)
    expect(sent.map((b) => [b['module'], b['page']])).toEqual([
      ['Calls', 1],
      ['Meetings', 1],
      ['Meetings', 2],
      ['Tasks', 1],
    ])
  })

  it('crosses an empty module', async () => {
    counts = { Calls: 3, Meetings: 0, Tasks: 2 }
    expect(await page('listActivities', 1, 10)).toEqual({ ids: all(), hasMore: false })
  })

  it('sends only token, module and page', async () => {
    counts = { Calls: 1 }
    await page('listActivities', 1, 10)
    for (const b of sent) expect(Object.keys(b).sort()).toEqual(['module', 'page', 'token'])
  })
})

describe('barantum pipelines', () => {
  it('listPipelines refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(adapter.listPipelines(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Barantum cannot list pipelines: /),
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('getPipeline refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(adapter.getPipeline(CREDS, 'p1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('barantum get* by the documented <module>_uuid filter', () => {
  beforeEach(() => {
    counts = { Contacts: 3, Org: 3, Deals: 3, Notes: 3, Calls: 3, Meetings: 3, Tasks: 3 }
  })

  it('getContact', async () => {
    const c = ContactSchema.parse(await adapter.getContact(CREDS, uuidOf('Contacts', 2)))
    expect(c.id).toBe(uuidOf('Contacts', 2))
    expect(sent).toEqual([{ token: JWT, module: 'Contacts', contacts_uuid: uuidOf('Contacts', 2) }])
  })

  it('getCompany', async () => {
    const c = CompanySchema.parse(await adapter.getCompany(CREDS, uuidOf('Org', 3)))
    expect(c.id).toBe(uuidOf('Org', 3))
    expect(sent).toEqual([{ token: JWT, module: 'Org', org_uuid: uuidOf('Org', 3) }])
  })

  it('getDeal', async () => {
    const d = DealSchema.parse(await adapter.getDeal(CREDS, uuidOf('Deals', 1)))
    expect(d.id).toBe(uuidOf('Deals', 1))
    expect(sent).toEqual([{ token: JWT, module: 'Deals', deals_uuid: uuidOf('Deals', 1) }])
  })

  it('getNote', async () => {
    const n = NoteSchema.parse(await adapter.getNote(CREDS, uuidOf('Notes', 1)))
    expect(n.id).toBe(uuidOf('Notes', 1))
    expect(sent).toEqual([{ token: JWT, module: 'Notes', notes_uuid: uuidOf('Notes', 1) }])
  })

  it.each([
    ['Calls', 'calls', 'calls_uuid'],
    ['Meetings', 'meetings', 'meetings_uuid'],
    ['Tasks', 'tasks', 'tasks_uuid'],
  ] as const)('getActivity reads a %s id back from its module', async (module, prefix, field) => {
    const id = `${prefix}:${uuidOf(module, 2)}`
    const a = ActivitySchema.parse(await adapter.getActivity(CREDS, id))
    expect(a.id).toBe(id)
    expect(sent).toEqual([{ token: JWT, module, [field]: uuidOf(module, 2) }])
  })

  it('reads back every id a list returned', async () => {
    const [first] = await adapter.listActivities(CREDS, { page: 1, limit: 100 })
    expect((await adapter.getActivity(CREDS, first!.id)).id).toBe(first!.id)
  })

  it('returns the row whose uuid matches, not the first row of the response', async () => {
    // A response that holds more than the filtered row (a filter the platform
    // did not apply) must not hand back some other record under this id.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(200, {
          code: '200',
          result: {
            total: 3,
            page_last: 1,
            per_page: PER_PAGE,
            page_current: 1,
            page_next: 2,
            content: rowsOf('Contacts'),
          },
        }),
      ),
    )
    expect((await adapter.getContact(CREDS, uuidOf('Contacts', 2))).id).toBe(uuidOf('Contacts', 2))
    await expect(adapter.getContact(CREDS, 'missing')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('404s when the filter matches no row', async () => {
    await expect(adapter.getContact(CREDS, 'missing')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('404s an activity id that names no module, without a request', async () => {
    await expect(adapter.getActivity(CREDS, uuidOf('Calls', 1))).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('barantum errors', () => {
  it('surfaces the documented 401 with its status', async () => {
    await expect(
      adapter.listContacts({ accessToken: 'wrong' }, { page: 1, limit: 5 }),
    ).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('surfaces a non-200 code in a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { code: '401', result: 'Unauthorized' })),
    )
    await expect(adapter.listDeals(CREDS, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})

describe('barantum pager state is kept per module and per connection', () => {
  it("a module walk does not reuse another module's cursor", async () => {
    counts = { Contacts: 45, Deals: 5 }
    // Contacts page 3 (limit 10) sits on upstream page 2.
    await page('listContacts', 3, 10)
    sent = []
    // Deals has one upstream page: page 3 of it is empty, and must be read from page 1.
    expect(await page('listDeals', 3, 10)).toEqual({ ids: [], hasMore: false })
    expect(sent.map((b) => b['page'])).toEqual([1])
  })

  it("one connection does not reuse another connection's cursor", async () => {
    counts = { Contacts: 45 }
    counts2 = { Contacts: 5 }
    await page('listContacts', 3, 10)
    sent = []
    const params: QueryParams = withPageSink({ page: 3, limit: 10 })
    expect(await adapter.listContacts(CREDS2, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(sent.map((b) => [b['token'], b['page']])).toEqual([[JWT2, 1]])
  })
})

describe('barantum response envelope', () => {
  const stubResult = (result: Record<string, unknown>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { code: '200', result })),
    )

  it('rejects a result with no page_last instead of ending the list as complete', async () => {
    stubResult({ total: 1, per_page: PER_PAGE, page_current: 1, content: [DOC_CONTACT] })
    await expect(adapter.listContacts(CREDS, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 502,
    })
  })

  it('rejects a result with no content array', async () => {
    stubResult({ total: 1, page_last: 1, per_page: PER_PAGE, page_current: 1 })
    await expect(adapter.listContacts(CREDS, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 502,
    })
  })

  it('surfaces a non-JSON HTTP error with its status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Service Unavailable</html>', { status: 503 })),
    )
    await expect(adapter.listContacts(CREDS, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 503,
    })
  })
})
