import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { ActiveCampaignAdapter } from '../../../../../../src/verticals/crm/adapters/activecampaign/index'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { DEFAULT_PAGE_SIZE as ADAPTER_DEFAULT } from '../../../../../../src/verticals/crm/adapters/activecampaign/constants'

/**
 * ActiveCampaign v3 collections page by `limit` + `offset`
 * (https://developers.activecampaign.com/reference/pagination):
 *
 *   "The query parameter `limit` can be used to alter the number of records
 *    returned. A typical endpoint will return 20 records by default and will
 *    allow a maximum of 100 records to be returned. The query parameter
 *    `offset` can be used to offset the result set. These query parameters can
 *    be combined to recover all records in a collection through a series of
 *    requests by incrementing the `offset` by the value of `limit` with each
 *    request."
 *   "The total number of results in a collection can be found in the
 *    `meta.total` property of the response."
 *
 * The adapter used to read `offset` from params.offset/params.cursor and never
 * from `page`, so every caller page sent offset=0 and page 2 repeated page 1.
 */

const creds = { accessToken: 'tok', extra: { account: 'acct' } }
const MAX = 100
const DEFAULT = 20
let requests: URL[] = []

type Method =
  'listContacts' | 'listCompanies' | 'listDeals' | 'listPipelines' | 'listActivities' | 'listNotes'

const CASES: Array<{ method: Method; path: string; key: string }> = [
  { method: 'listContacts', path: '/api/3/contacts', key: 'contacts' },
  // Companies are CRM accounts: GET /accounts (list-all-accounts). The
  // /organizations nodes are deprecated and absent from the v3 OpenAPI.
  { method: 'listCompanies', path: '/api/3/accounts', key: 'accounts' },
  { method: 'listDeals', path: '/api/3/deals', key: 'deals' },
  { method: 'listPipelines', path: '/api/3/dealGroups', key: 'dealGroups' },
  { method: 'listActivities', path: '/api/3/dealTasks', key: 'dealTasks' },
  { method: 'listNotes', path: '/api/3/notes', key: 'notes' },
]

/** Honours only `limit` (default 20, max 100) and `offset`, and answers meta.total. */
function slice<T>(rows: T[], url: URL): T[] {
  const rawLimit = url.searchParams.get('limit')
  const limit = rawLimit === null ? DEFAULT : Math.min(Number(rawLimit), MAX)
  const offset = Number(url.searchParams.get('offset') ?? 0)
  return rows.slice(offset, offset + limit)
}

function serve(
  path: string,
  key: string,
  n: number,
  stages = 0,
  opts: { noMeta?: boolean; stagesIgnoreOffset?: boolean } = {},
) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: String(i + 1),
    title: `r${i + 1}`,
    name: `r${i + 1}`,
  }))
  // Every stage belongs to pipeline 1.
  const stageRows = Array.from({ length: stages }, (_, i) => ({
    id: String(1000 + i),
    group: '1',
    title: `s${i}`,
    order: String(i),
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      let body: Record<string, unknown>
      if (url.pathname === path) {
        body = { [key]: slice(rows, url) }
        if (!opts.noMeta) body.meta = { total: String(rows.length) }
      } else if (url.pathname === '/api/3/dealStages') {
        const page = opts.stagesIgnoreOffset ? stageRows.slice(0, MAX) : slice(stageRows, url)
        body = { dealStages: page }
        if (!opts.noMeta) body.meta = { total: String(stageRows.length) }
      } else {
        return new Response('not found', { status: 404 })
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

function call(method: Method, params: QueryParams) {
  const adapter = new ActiveCampaignAdapter()
  return (
    adapter[method] as (c: typeof creds, p: QueryParams) => Promise<Array<{ id: string }>>
  ).call(adapter, creds, params)
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(CASES)('activecampaign $method paging', ({ method, path, key }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(path, key, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports hasMore false on a full last page when rows are an exact multiple of limit', async () => {
    serve(path, key, 6)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await call(method, params)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('reports neither hasMore nor totalCount when the upstream sends no meta.total', async () => {
    serve(path, key, 7, 0, { noMeta: true })
    const params = withPageSink({ page: 1, limit: 3 })
    const rows = await call(method, params)
    expect(rows).toHaveLength(3)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
  })

  it('sends the adapter default page size when no limit is given', async () => {
    serve(path, key, 7)
    await call(method, withPageSink({ page: 1 } as QueryParams))
    const req = requests.find((u) => u.pathname === path)!
    expect(req.searchParams.get('limit')).toBe(String(ADAPTER_DEFAULT))
    expect(req.searchParams.get('offset')).toBe('0')
  })

  it('sends offset = (page - 1) * limit on page 2', async () => {
    serve(path, key, 7)
    await call(method, withPageSink({ page: 2, limit: 3 }))
    const req = requests.find((u) => u.pathname === path)!
    expect(req.searchParams.get('offset')).toBe('3')
    expect(req.searchParams.get('limit')).toBe('3')
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    const N = 2 * MAX + 5
    serve(path, key, N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      const sent = requests.filter((u) => u.pathname === path).at(-1)!
      expect(Number(sent.searchParams.get('limit'))).toBeLessThanOrEqual(MAX)
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(path, key, 7)
    const params = parseListQuery({ page: '2', limit: '3' }, new ActiveCampaignAdapter())
    const rows = await call(method, params)
    const out = listPage(rows, params, 'activecampaign')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)

    const last = parseListQuery({ page: '3', limit: '3' }, new ActiveCampaignAdapter())
    const tail = listPage(await call(method, last), last, 'activecampaign')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})

describe('activecampaign listPipelines stages', () => {
  it('pages /dealStages at the documented maximum and keeps every stage', async () => {
    serve('/api/3/dealGroups', 'dealGroups', 1, 2 * MAX + 5)
    const [pipeline] = (await new ActiveCampaignAdapter().listPipelines(
      creds,
      withPageSink({ page: 1, limit: 10 }),
    )) as Array<{ id: string; stages: unknown[] }>
    expect(pipeline!.stages).toHaveLength(2 * MAX + 5)
    for (const u of requests.filter((r) => r.pathname === '/api/3/dealStages')) {
      expect(Number(u.searchParams.get('limit'))).toBeLessThanOrEqual(MAX)
    }
  })

  it('stops on meta.total without an extra request when stages fill the last page exactly', async () => {
    serve('/api/3/dealGroups', 'dealGroups', 1, MAX)
    await new ActiveCampaignAdapter().listPipelines(creds, withPageSink({ page: 1, limit: 10 }))
    expect(requests.filter((r) => r.pathname === '/api/3/dealStages')).toHaveLength(1)
  })

  it('terminates when the upstream ignores offset and sends no total', async () => {
    serve('/api/3/dealGroups', 'dealGroups', 1, MAX, { noMeta: true, stagesIgnoreOffset: true })
    await new ActiveCampaignAdapter().listPipelines(creds, withPageSink({ page: 1, limit: 10 }))
    const n = requests.filter((r) => r.pathname === '/api/3/dealStages').length
    expect(n).toBeGreaterThan(1)
    expect(n).toBeLessThanOrEqual(50)
  })
})

describe('activecampaign companies are CRM accounts', () => {
  it('declares the documented page maximum of 100', () => {
    expect(new ActiveCampaignAdapter().capabilities.maxPageSize).toBe(MAX)
  })

  it('listCompanies sends only limit and offset to /accounts, never /organizations', async () => {
    serve('/api/3/accounts', 'accounts', 7)
    await call('listCompanies', withPageSink({ page: 2, limit: 3 }))
    expect(requests.map((u) => u.pathname)).toEqual(['/api/3/accounts'])
    expect([...requests[0]!.searchParams.keys()].sort()).toEqual(['limit', 'offset'])
  })

  it('listCompanies maps the documented GET /accounts example through the account shape', async () => {
    // https://developers.activecampaign.com/reference/list-all-accounts (verbatim, minus
    // `links`, which the docs print as non-JSON object members inside array brackets)
    const accounts = [
      {
        name: 'First Example Account',
        accountUrl: null,
        createdTimestamp: '2019-04-29T07:51:31-05:00',
        updatedTimestamp: '2019-04-29T07:51:31-05:00',
        contactCount: '1',
        dealCount: '3',
        id: '1',
      },
      {
        name: 'Second Example Account',
        accountUrl: null,
        createdTimestamp: '2019-04-29T07:51:32-05:00',
        updatedTimestamp: '2019-04-29T07:51:32-05:00',
        contactCount: '2',
        dealCount: '5',
        id: '2',
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ accounts, meta: { total: '2' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const params = withPageSink({ page: 1, limit: 10 })
    const out = await new ActiveCampaignAdapter().listCompanies(creds, params)
    expect(out.map((c) => CompanySchema.parse(c))).toMatchObject([
      { id: '1', name: 'First Example Account', created_at: '2019-04-29T12:51:31.000Z' },
      { id: '2', name: 'Second Example Account', updated_at: '2019-04-29T12:51:32.000Z' },
    ])
    // Both documented rows print "accountUrl": null, so neither carries a domain.
    expect(out.map((c) => c.domain)).toEqual([undefined, undefined])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('getCompany reads GET /accounts/:id and unwraps `account`', async () => {
    // Documented example: https://developers.activecampaign.com/reference/retrieve-an-account
    const account = {
      name: 'Example Account',
      accountUrl: 'https://www.example.com',
      createdTimestamp: '2019-05-15T15:58:16-05:00',
      updatedTimestamp: '2019-05-15T15:58:16-05:00',
      links: [],
      id: '1',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = new URL(input)
        requests.push(url)
        if (url.pathname !== '/api/3/accounts/1') return new Response('not found', { status: 404 })
        return new Response(JSON.stringify({ account }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const out = await new ActiveCampaignAdapter().getCompany(creds, '1')
    expect(requests.map((u) => u.pathname)).toEqual(['/api/3/accounts/1'])
    expect(out.id).toBe('1')
    expect(out.name).toBe('Example Account')
    expect(out.domain).toBe('www.example.com')
  })
})
