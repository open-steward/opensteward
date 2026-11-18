import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { SageCrmAdapter } from '../../../../../../src/verticals/crm/adapters/sage-crm/index'
import { communication, company, note, opportunity, person } from './fixtures/documented'

/**
 * Sage CRM RESTful API (2024 R2 reference, "Using the API"):
 *   "Authorization: Basic {credentials}" (user name:password, Base64)
 *   "http://{server}/sdata/{installName}j/sagecrm2/-/{resource}"
 * Each "Retrieve all {Resource} records" GET takes only `orderBy` and returns
 * the whole collection as a JSON array; "Retrieve a {Resource} record" is
 * GET /{Resource}('{key}').
 */

const BASIC = Buffer.from('administrator:P@ssw0rd', 'utf8').toString('base64')
const creds = {
  accessToken: BASIC,
  extra: { serverUrl: 'https://crm.example.com', installName: 'crm' },
}
const BASE_PATH = '/sdata/crmj/sagecrm2/-'

interface Seen {
  url: URL
  headers: Record<string, string>
}
let requests: Seen[] = []

type ListMethod = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities' | 'listNotes'
type GetMethod = 'getContact' | 'getCompany' | 'getDeal' | 'getActivity' | 'getNote'

const CASES: {
  list: ListMethod
  get: GetMethod
  resource: string
  orderBy: string
  row: (id: number) => Record<string, unknown>
}[] = [
  {
    list: 'listContacts',
    get: 'getContact',
    resource: 'Person',
    orderBy: 'Pers_PersonId asc',
    row: person,
  },
  {
    list: 'listCompanies',
    get: 'getCompany',
    resource: 'Company',
    orderBy: 'Comp_CompanyId asc',
    row: company,
  },
  {
    list: 'listDeals',
    get: 'getDeal',
    resource: 'Opportunity',
    orderBy: 'Oppo_OpportunityId asc',
    row: opportunity,
  },
  {
    list: 'listActivities',
    get: 'getActivity',
    resource: 'Communication',
    orderBy: 'Comm_CommunicationId asc',
    row: communication,
  },
  { list: 'listNotes', get: 'getNote', resource: 'Notes', orderBy: 'Note_NoteId asc', row: note },
]

/**
 * Fake upstream honouring only what the reference documents: Basic auth, the
 * sagecrm2 path, `orderBy` as the sole list parameter (any other query
 * parameter is rejected), a bare array holding every record, and
 * /{Resource}('{key}') for one record.
 */
function serve(resource: string, rows: Record<string, unknown>[], keyField: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      requests.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
      if ((init?.headers as Record<string, string>)?.['Authorization'] !== `Basic ${BASIC}`) {
        return new Response('unauthorized', { status: 401 })
      }
      const path = decodeURIComponent(url.pathname)
      if (path === `${BASE_PATH}/${resource}`) {
        for (const k of url.searchParams.keys()) {
          if (k !== 'orderBy') return new Response(`unknown parameter ${k}`, { status: 400 })
        }
        return Response.json(rows)
      }
      const m = path.match(new RegExp(`^${BASE_PATH}/${resource}\\('(\\d+)'\\)$`))
      if (m) {
        const row = rows.find((r) => String(r[keyField]) === m[1])
        return row ? Response.json(row) : new Response('not found', { status: 404 })
      }
      return new Response('not found', { status: 404 })
    }),
  )
}

function list(adapter: SageCrmAdapter, method: ListMethod, params: QueryParams) {
  return (adapter[method] as (c: typeof creds, p: QueryParams) => Promise<{ id: string }[]>).call(
    adapter,
    creds,
    params,
  )
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(CASES)('sage-crm $list', ({ list: method, get, resource, orderBy, row }) => {
  const keyField = Object.keys(row(1))[0]!

  it(
    'sends GET {server}/sdata/{installName}j/sagecrm2/-/' +
      resource +
      ' with Basic auth and only orderBy',
    async () => {
      serve(resource, [row(1)], keyField)
      await list(new SageCrmAdapter(), method, { page: 1, limit: 10 })
      expect(requests).toHaveLength(1)
      const { url, headers } = requests[0]!
      expect(url.origin).toBe('https://crm.example.com')
      expect(url.pathname).toBe(`${BASE_PATH}/${resource}`)
      expect([...url.searchParams.entries()]).toEqual([['orderBy', orderBy]])
      expect(headers['Authorization']).toBe(`Basic ${BASIC}`)
    },
  )

  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    const rows = Array.from({ length: 2 * L + 1 }, (_, i) => row(i + 1))
    serve(resource, rows, keyField)
    const adapter = new SageCrmAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const out = await list(adapter, method, params)
      seen.push(...out.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
    }
    expect(seen).toEqual(rows.map((_, i) => String(i + 1)))
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(hasMore).toEqual([true, true, false])
  })

  it('page past the end is empty with hasMore false', async () => {
    serve(resource, [row(1), row(2)], keyField)
    const params = withPageSink({ page: 3, limit: 2 })
    expect(await list(new SageCrmAdapter(), method, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it(`${get} reads back a listed id through GET /${resource}('{key}')`, async () => {
    serve(resource, [row(1), row(42)], keyField)
    const adapter = new SageCrmAdapter()
    const one = await (
      adapter[get] as (c: typeof creds, id: string) => Promise<{ id: string }>
    ).call(adapter, creds, '42')
    expect(one.id).toBe('42')
    expect(decodeURIComponent(requests[0]!.url.pathname)).toBe(`${BASE_PATH}/${resource}('42')`)
  })

  it(`${get} rejects a non-integer key without sending a request`, async () => {
    serve(resource, [], keyField)
    const adapter = new SageCrmAdapter()
    await expect(
      (adapter[get] as (c: typeof creds, id: string) => Promise<unknown>).call(
        adapter,
        creds,
        "1')/x",
      ),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(requests).toHaveLength(0)
  })

  it('throws when the upstream does not return the documented array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [row(1)] })),
    )
    await expect(list(new SageCrmAdapter(), method, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})

describe('sage-crm listPipelines', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(
      new SageCrmAdapter().listPipelines(creds, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('sage-crm connection', () => {
  it('uses the documented default install name "crm" when none is stored', async () => {
    serve('Person', [], 'Pers_PersonId')
    await new SageCrmAdapter().listContacts(
      { accessToken: BASIC, extra: { serverUrl: 'https://crm.example.com/' } },
      { page: 1, limit: 5 },
    )
    expect(requests[0]!.url.pathname).toBe('/sdata/crmj/sagecrm2/-/Person')
  })

  it('puts a custom install name before the literal "j"', async () => {
    const fetchSpy = vi.fn(async () => Response.json([]))
    vi.stubGlobal('fetch', fetchSpy)
    await new SageCrmAdapter().listNotes(
      { accessToken: BASIC, extra: { serverUrl: 'http://10.0.0.5', installName: 'sales' } },
      { page: 1, limit: 5 },
    )
    const calls = fetchSpy.mock.calls as unknown as [string][]
    expect(new URL(calls[0]![0]).pathname).toBe('/sdata/salesj/sagecrm2/-/Notes')
  })

  it('a pre-rebuild API-key connection (no server URL) must reconnect, without a request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(
      new SageCrmAdapter().listContacts({ accessToken: 'old-api-key' }, { page: 1, limit: 5 }),
    ).rejects.toThrow(/server URL/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a connection with a server URL but no Basic credentials must reconnect, without a request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const err = await new SageCrmAdapter()
      .listContacts(
        { accessToken: '', extra: { serverUrl: 'https://crm.example.com' } },
        { page: 1, limit: 5 },
      )
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 401, code: 'RECONNECT_REQUIRED' })
    expect((err as Error).message).toMatch(/user name and password/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('exchangeCredentials Base64-encodes "user name:password" as the Basic credentials', async () => {
    const out = await new SageCrmAdapter().exchangeCredentials({
      serverUrl: 'https://crm.example.com/',
      installName: '',
      username: 'administrator',
      password: 'P@ssw0rd',
    })
    // The reference's own example: administrator:P@ssw0rd -> YWRtaW5pc3RyYXRvcjpQQHNzdzByZA==
    expect(out).toEqual({
      accessToken: 'YWRtaW5pc3RyYXRvcjpQQHNzdzByZA==',
      extra: { serverUrl: 'https://crm.example.com', installName: 'crm' },
    })
  })

  it('exchangeCredentials rejects a missing server, user name or password', async () => {
    const a = new SageCrmAdapter()
    await expect(
      a.exchangeCredentials({ serverUrl: '', username: 'u', password: 'p' }),
    ).rejects.toThrow()
    await expect(
      a.exchangeCredentials({ serverUrl: 'https://x', username: '', password: 'p' }),
    ).rejects.toThrow()
    await expect(
      a.exchangeCredentials({ serverUrl: 'https://x', username: 'u', password: '' }),
    ).rejects.toThrow()
  })
})
