import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'
import { SpotlerCrmAdapter } from '../../../../../../src/verticals/crm/adapters/spotler-crm/index'
import { ACCOUNT_RECORD, recordMetadata } from './fixtures'

/**
 * Spotler CRM API v4, from https://support.reallysimplesystems.com/api-v4/:
 *   - host: "enter https://apiv4.reallysimplesystems.com/accounts into the
 *     'Curl Command URL' field";
 *   - auth: "Authorization: Bearer {access_token}";
 *   - objects: accounts, activities, contacts, campaigns, campaigndetails,
 *     campaignstages, cases, documents, opportunities, opportunityhistories,
 *     opportunity_lines (no stages, pipelines or notes);
 *   - "All GET requests are limited to 100 records at a time and defaulted to
 *     10. You can change this limit by passing limit in the URL.";
 *   - "GET /accounts?page=2 This will return your accounts starting from the
 *     2oth record by default." and "GET /accounts?limit=100&page=4 This will
 *     return your accounts starting at the 400th record." — page N starts at
 *     row N x limit, so pages count from 0;
 *   - "If the page cannot be found, no records will be returned.";
 *   - list response `{ metadata: { url, object_type, total_count, has_more },
 *     list: [{ metadata, record }] }`.
 * The fake honours exactly `page` and `limit` on lists, and no parameter on
 * a single-record GET.
 */

const HOST = 'https://apiv4.reallysimplesystems.com'
const creds = { accessToken: 'tok' }

let requests: URL[] = []

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type Row = { id: number } & Record<string, unknown>
type Collections = Partial<Record<'accounts' | 'contacts' | 'activities', Row[]>>

function serve(cols: Collections) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input)
      requests.push(url)
      const headers = init.headers as Record<string, string>
      if (url.origin !== HOST) return json({ message: 'wrong host' }, 500)
      if (headers['Authorization'] !== 'Bearer tok')
        return json({ type: 'Authentication error', code: 403, message: 'Unauthenticated.' }, 403)
      const one = /^\/(accounts|contacts|activities)\/(\d+)$/.exec(url.pathname)
      if (one) {
        if ([...url.searchParams.keys()].length > 0) return json({ message: 'bad param' }, 400)
        const rows = cols[one[1] as keyof Collections] ?? []
        const row = rows.find((r) => r.id === Number(one[2]))
        if (!row) return json({ type: 'Not found', code: 404, message: 'Record not found' }, 404)
        return json({ metadata: recordMetadata(one[1]!, row.id), record: row })
      }
      const list = /^\/(accounts|contacts|activities)$/.exec(url.pathname)
      if (!list)
        return json(
          { type: 'Invalid Request error', code: 500, message: 'Invalid record type' },
          500,
        )
      for (const k of url.searchParams.keys())
        if (k !== 'page' && k !== 'limit') return json({ message: `undocumented ${k}` }, 400)
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 10), 100)
      const page = Number(url.searchParams.get('page') ?? 0)
      const rows = cols[list[1] as keyof Collections] ?? []
      const start = page * limit
      const slice = rows.slice(start, start + limit)
      return json({
        metadata: {
          url: `/${list[1]}`,
          object_type: 'list',
          total_count: rows.length,
          has_more: start + limit < rows.length,
        },
        list: slice.map((r) => ({ metadata: recordMetadata(list[1]!, r.id), record: r })),
      })
    }),
  )
}

function rows(n: number, extra: (i: number) => Record<string, unknown> = () => ({})): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: 1000 + i, ...extra(i) }))
}

let adapter: SpotlerCrmAdapter

beforeEach(() => {
  requests = []
  adapter = new SpotlerCrmAdapter()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function walk<T extends { id: string }>(
  list: (params: Record<string, unknown>) => Promise<T[]>,
  limit: number,
): Promise<{ ids: string[]; pages: number }> {
  const ids: string[] = []
  for (let page = 1; ; page++) {
    const params = withPageSink({ page, limit })
    const got = await list(params)
    ids.push(...got.map((r) => r.id))
    const meta = readUpstreamPage(params)
    if (meta?.hasMore !== true) {
      expect(meta?.hasMore).toBe(false)
      return { ids, pages: page }
    }
    if (page > 50) throw new Error('walk did not end')
  }
}

describe('SpotlerCrmAdapter — host, auth and request shape', () => {
  it('lists accounts on the documented v4 host with page and limit only', async () => {
    serve({ accounts: [ACCOUNT_RECORD] })
    const out = await adapter.listCompanies(creds, withPageSink({ page: 1, limit: 25 }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.origin + requests[0]!.pathname).toBe(`${HOST}/accounts`)
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({ page: '0', limit: '25' })
    expect(out).toHaveLength(1)
    expect(CompanySchema.parse(out[0]).id).toBe('95920978')
    expect(out[0]!.name).toBe('test')
  })

  it('lists contacts from /contacts and activities from /activities', async () => {
    serve({ contacts: rows(1), activities: rows(1) })
    const contacts = await adapter.listContacts(creds, withPageSink({ page: 1, limit: 10 }))
    const activities = await adapter.listActivities(creds, withPageSink({ page: 1, limit: 10 }))
    expect(requests.map((u) => u.pathname)).toEqual(['/contacts', '/activities'])
    expect(ContactSchema.parse(contacts[0]).id).toBe('1000')
    expect(ActivitySchema.parse(activities[0]).id).toBe('1000')
  })

  it('reads one account and one contact out of the record envelope', async () => {
    serve({ accounts: [ACCOUNT_RECORD], contacts: rows(1) })
    const company = await adapter.getCompany(creds, '95920978')
    const contact = await adapter.getContact(creds, '1000')
    expect(requests.map((u) => u.pathname)).toEqual(['/accounts/95920978', '/contacts/1000'])
    expect(company.id).toBe('95920978')
    expect(company.name).toBe('test')
    expect(contact.id).toBe('1000')
  })

  it('clamps a limit above the documented 100 and reports the size it sent', async () => {
    serve({ accounts: rows(150, (i) => ({ name: `a${i}` })) })
    const params = withPageSink({ page: 1, limit: 150 })
    const out = await adapter.listCompanies(creds, params)
    expect(requests[0]!.searchParams.get('limit')).toBe('100')
    expect(out).toHaveLength(100)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 100 })
  })

  it('does not report a page size at or below the maximum', async () => {
    serve({ accounts: rows(3, (i) => ({ name: `a${i}` })) })
    const params = withPageSink({ page: 1, limit: 100 })
    await adapter.listCompanies(creds, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('declares the documented page maximum', () => {
    expect(adapter.capabilities.maxPageSize).toBe(100)
  })
})

describe('SpotlerCrmAdapter — paging walk', () => {
  const L = 2
  const N = 2 * L + 1

  it.each([
    ['listCompanies', 'accounts'],
    ['listContacts', 'contacts'],
    ['listActivities', 'activities'],
  ] as const)('%s serves every id once with an exact hasMore', async (method, object) => {
    const data = rows(N, (i) => ({ name: `r${i}` }))
    serve({ [object]: data })
    const { ids, pages } = await walk(
      (p) =>
        (
          adapter[method] as (
            c: typeof creds,
            p: Record<string, unknown>,
          ) => Promise<{ id: string }[]>
        )(creds, p),
      L,
    )
    expect(ids).toEqual(data.map((r) => String(r.id)))
    expect(new Set(ids).size).toBe(N)
    expect(pages).toBe(L + 1)
    expect(requests.map((u) => u.searchParams.get('page'))).toEqual(['0', '1', '2'])
  })

  it('reports hasMore false on a page that ends exactly at the collection end', async () => {
    serve({ contacts: rows(4) })
    const params = withPageSink({ page: 2, limit: 2 })
    const out = await adapter.listContacts(creds, params)
    expect(out.map((c) => c.id)).toEqual(['1002', '1003'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('SpotlerCrmAdapter — refused reads send nothing', () => {
  beforeEach(() => serve({}))

  it.each([
    ['listPipelines', () => adapter.listPipelines(creds, withPageSink({ page: 1, limit: 10 }))],
    ['listNotes', () => adapter.listNotes(creds, withPageSink({ page: 1, limit: 10 }))],
    ['listDeals', () => adapter.listDeals(creds, withPageSink({ page: 1, limit: 10 }))],
    ['getDeal', () => adapter.getDeal(creds, '1')],
  ] as const)('%s throws 501 NOT_SUPPORTED', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(requests).toHaveLength(0)
  })
})

describe('SpotlerCrmAdapter — defaults and documented edge responses', () => {
  it('sends the documented default of 10 when the caller gives no limit', async () => {
    serve({ accounts: rows(12, (i) => ({ name: `a${i}` })) })
    const params = withPageSink({ page: 1 })
    const out = await adapter.listCompanies(creds, params)
    expect(requests[0]!.searchParams.get('limit')).toBe('10')
    expect(out).toHaveLength(10)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('refuses a list body without the documented { metadata.has_more, list } envelope with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        requests.push(new URL(input))
        return json({ data: [{ id: 1 }] })
      }),
    )
    await expect(
      adapter.listCompanies(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 502 })
    expect(requests).toHaveLength(1)
  })

  it.each([
    ['an empty body', () => new Response('', { status: 200 })],
    ['a body with no record', () => json({ metadata: { url: '/accounts/1' } })],
  ])('getCompany turns "or nothing" (%s) into a 404', async (_label, body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        requests.push(new URL(input))
        return body()
      }),
    )
    await expect(adapter.getCompany(creds, '1')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getContact(creds, '1')).rejects.toMatchObject({ statusCode: 404 })
    expect(requests.map((u) => u.pathname)).toEqual(['/accounts/1', '/contacts/1'])
  })
})
