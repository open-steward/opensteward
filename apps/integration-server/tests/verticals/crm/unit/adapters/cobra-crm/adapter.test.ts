import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { CobraCrmAdapter } from '../../../../../../src/verticals/crm/adapters/cobra-crm/index'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'
import { CompanySchema } from '../../../../../../src/verticals/crm/schema/company'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'

/**
 * cobra CRM Cloud (https://apis.cobra-hilfe.de). The fake upstream honours only
 * what the docs describe:
 *   - host https://api.cobra.de/v1 (api-7858747: "servers: - url: https://api.cobra.de/v1");
 *   - X-Integration-Name, X-Integration-Provider and X-Cobra-TenantId on every
 *     request (doc-431461), else 400;
 *   - POST /auth/token {username, password} → data.bearerToken (api-5487706, doc-386341);
 *   - GET /people declares no query parameters (api-7858747): every row, whole,
 *     with metaData.totalResults.
 */

const TENANT = '12e39e53-ece1-4d8d-8958-e782de1dbef0'
const creds = {
  accessToken: 'bearer-1',
  extra: { email: 'api@example.test', apiKey: 'k-1', cobraTenantId: TENANT },
}

interface Seen {
  method: string
  url: URL
  headers: Record<string, string>
  body?: unknown
}
let requests: Seen[] = []

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A 24-hex id, the documented pattern `^([A-F]|[a-f]|[0-9]){24}$` (api-7858749). */
function hexId(prefix: string, i: number): string {
  return `${prefix}${i.toString(16).padStart(4, '0')}`
}
const P1 = hexId('65d3151fd6a8b43e0c7a', 1)
const C1 = '65d3151fd6a8b43e0c7a2c02'
const T1 = '65d3151fd6a8b43e0c7a3d03'

function person(i: number) {
  return {
    id: hexId('65d3151fd6a8b43e0c7a', i),
    firstname: `F${i}`,
    lastname: `L${i}`,
    name: `L${i}, F${i}`,
    email: `p${i}@x.example`,
  }
}

function serve(
  opts: {
    people?: number
    totalResults?: number | null
    peopleData?: unknown
    byId?: Record<string, unknown>
  } = {},
) {
  const n = opts.people ?? 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input)
      const headers = Object.fromEntries(
        Object.entries((init.headers ?? {}) as Record<string, string>),
      )
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
      requests.push({ method: init.method ?? 'GET', url, headers, body })
      if (url.origin !== 'https://api.cobra.de')
        return new Response('no such host', { status: 599 })
      for (const h of ['X-Integration-Name', 'X-Integration-Provider', 'X-Cobra-TenantId']) {
        if (!headers[h]) return json({ data: null, message: `missing ${h}`, statusCode: 400 }, 400)
      }
      if (url.pathname === '/v1/auth/token' && init.method === 'POST') {
        const b = body as { username?: string; password?: string }
        if (b.username === 'api@example.test' && b.password === 'k-1') {
          return json({ data: { bearerToken: 'bearer-new' }, message: null, statusCode: 200 })
        }
        return json({ data: null, message: 'bad login', statusCode: 400 }, 400)
      }
      if (url.pathname === '/v1/people' && [...url.searchParams.keys()].length === 0) {
        const rows = Array.from({ length: n }, (_, i) => person(i + 1))
        const metaData =
          opts.totalResults === null
            ? undefined
            : {
                totalResults: opts.totalResults ?? n,
                responseTimeStamp: '2024-02-19T08:57:43.041Z',
              }
        const data = 'peopleData' in opts ? opts.peopleData : rows
        return json({ data, message: null, metaData, statusCode: 200 })
      }
      if (opts.byId && url.pathname in opts.byId) {
        return json({ data: opts.byId[url.pathname], message: null, statusCode: 200 })
      }
      return json(
        { data: null, message: 'Entity could not be found.', metaData: null, statusCode: 404 },
        404,
      )
    }),
  )
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cobra-crm auth', () => {
  it('exchanges email + API key + tenant at POST /auth/token for a one-hour bearer token', async () => {
    serve()
    const before = Date.now()
    const out = await new CobraCrmAdapter().exchangeCredentials({
      email: 'api@example.test',
      apiKey: 'k-1',
      cobraTenantId: TENANT,
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('POST')
    expect(requests[0].url.href).toBe('https://api.cobra.de/v1/auth/token')
    expect(requests[0].body).toEqual({ username: 'api@example.test', password: 'k-1' })
    expect(requests[0].headers['X-Cobra-TenantId']).toBe(TENANT)
    expect(out.accessToken).toBe('bearer-new')
    expect(out.extra).toEqual({ email: 'api@example.test', apiKey: 'k-1', cobraTenantId: TENANT })
    const ttl = out.expiresAt!.getTime() - before
    expect(ttl).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000)
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000 + 1000)
  })

  it('refuses an incomplete form without sending anything', async () => {
    serve()
    await expect(
      new CobraCrmAdapter().exchangeCredentials({ email: 'api@example.test', apiKey: 'k-1' }),
    ).rejects.toThrow(/tenant ID/)
    expect(requests).toHaveLength(0)
  })

  it('refreshes by re-running the grant from credentials.extra', async () => {
    serve()
    const out = await new CobraCrmAdapter().refreshCredentials(creds)
    expect(out.accessToken).toBe('bearer-new')
    expect(requests[0].url.pathname).toBe('/v1/auth/token')
  })

  it('a pre-rebuild connection (bare accessToken) must reconnect: refresh and reads refuse without a request', async () => {
    serve({ people: 1 })
    const adapter = new CobraCrmAdapter()
    await expect(adapter.refreshCredentials({ accessToken: 'old' })).rejects.toThrow(/reconnect/)
    await expect(
      adapter.listContacts({ accessToken: 'old' }, { page: 1, limit: 10 }),
    ).rejects.toThrow(/X-Cobra-TenantId/)
    expect(requests).toHaveLength(0)
  })
})

describe('cobra-crm listContacts (GET /people, paged locally)', () => {
  it('sends GET https://api.cobra.de/v1/people with no query and the documented headers', async () => {
    serve({ people: 2 })
    await new CobraCrmAdapter().listContacts(creds, { page: 1, limit: 10 })
    expect(requests).toHaveLength(1)
    const r = requests[0]
    expect(r.method).toBe('GET')
    expect(r.url.href).toBe('https://api.cobra.de/v1/people')
    expect(r.headers).toMatchObject({
      Authorization: 'Bearer bearer-1',
      'X-Integration-Name': 'OpenSteward',
      'X-Integration-Provider': 'OpenSteward',
      'X-Cobra-TenantId': TENANT,
    })
  })

  it('serves 2L+1 people across pages 1..3, each once, with exact hasMore', async () => {
    const L = 3
    serve({ people: 2 * L + 1 })
    const adapter = new CobraCrmAdapter()
    const seen: string[] = []
    const hasMore: (boolean | null)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listContacts(creds, params)
      rows.forEach((r) => ContactSchema.parse(r))
      seen.push(...rows.map((r) => r.id))
      hasMore.push(listPage(rows, params, 'cobra-crm').meta.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
    }
    expect(seen).toEqual(
      Array.from({ length: 2 * L + 1 }, (_, i) => hexId('65d3151fd6a8b43e0c7a', i + 1)),
    )
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
  })

  it('errors, rather than reporting a complete collection, when totalResults exceeds the rows returned', async () => {
    serve({ people: 5, totalResults: 9 })
    await expect(
      new CobraCrmAdapter().listContacts(creds, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(/returned 5 people but metaData.totalResults is 9/)
  })

  it('errors with 502 when the documented data array is null, rather than reading it as empty', async () => {
    serve({ people: 0, totalResults: 0, peopleData: null })
    await expect(
      new CobraCrmAdapter().listContacts(creds, { page: 1, limit: 3 }),
    ).rejects.toMatchObject({ statusCode: 502, message: expect.stringMatching(/no data array/) })
  })

  it('errors when the answer carries no totalResults to check completeness against', async () => {
    serve({ people: 5, totalResults: null })
    await expect(new CobraCrmAdapter().listContacts(creds, { page: 1, limit: 3 })).rejects.toThrow(
      /totalResults is undefined/,
    )
  })
})

describe('cobra-crm documented reads', () => {
  it('getContact reads GET /people/{id} and unwraps data', async () => {
    serve({
      byId: { [`/v1/people/${P1}`]: { id: P1, firstname: 'Erika', lastname: 'Mustermann' } },
    })
    const c = ContactSchema.parse(await new CobraCrmAdapter().getContact(creds, P1))
    expect(c).toMatchObject({ id: P1, first_name: 'Erika', last_name: 'Mustermann' })
    expect(requests[0].url.href).toBe(`https://api.cobra.de/v1/people/${P1}`)
  })

  it('getCompany reads GET /companies/{id}', async () => {
    serve({ byId: { [`/v1/companies/${C1}`]: { id: C1, name: 'Muster GmbH' } } })
    const c = CompanySchema.parse(await new CobraCrmAdapter().getCompany(creds, C1))
    expect(c).toMatchObject({ id: C1, name: 'Muster GmbH' })
    expect(requests[0].url.href).toBe(`https://api.cobra.de/v1/companies/${C1}`)
  })

  it('getActivity reads GET /touchpoints/{id}', async () => {
    serve({ byId: { [`/v1/touchpoints/${T1}`]: { id: T1, topic: 'Discovery call' } } })
    const a = ActivitySchema.parse(await new CobraCrmAdapter().getActivity(creds, T1))
    expect(a).toMatchObject({ id: T1, subject: 'Discovery call' })
    expect(requests[0].url.href).toBe(`https://api.cobra.de/v1/touchpoints/${T1}`)
  })

  it('a 200 whose envelope carries data: null surfaces as statusCode 404', async () => {
    serve({ byId: { [`/v1/people/${P1}`]: null } })
    await expect(new CobraCrmAdapter().getContact(creds, P1)).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringMatching(/returned no data/),
    })
    expect(requests).toHaveLength(1)
  })

  it.each([
    ['getContact', (a: CobraCrmAdapter, id: string) => a.getContact(creds, id), '/v1/people/'],
    ['getCompany', (a: CobraCrmAdapter, id: string) => a.getCompany(creds, id), '/v1/companies/'],
    [
      'getActivity',
      (a: CobraCrmAdapter, id: string) => a.getActivity(creds, id),
      '/v1/touchpoints/',
    ],
  ] as const)('%s escapes the id into one path segment', async (_name, call, prefix) => {
    serve()
    await expect(call(new CobraCrmAdapter(), 'a/b?c=1#d')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(requests[0].url.pathname).toBe(`${prefix}a%2Fb%3Fc%3D1%23d`)
    expect(requests[0].url.search).toBe('')
  })

  it('a documented 404 surfaces as statusCode 404', async () => {
    serve()
    await expect(new CobraCrmAdapter().getContact(creds, 'nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('cobra-crm refusals: 501 NOT_SUPPORTED before any request', () => {
  const CASES: [string, (a: CobraCrmAdapter) => Promise<unknown>, RegExp][] = [
    ['listPipelines', (a) => a.listPipelines(creds, { page: 1, limit: 10 }), /pipeline/],
    ['getPipeline', (a) => a.getPipeline(creds, 'x'), /pipeline/],
    ['listDeals', (a) => a.listDeals(creds, { page: 1, limit: 10 }), /deal/],
    ['getDeal', (a) => a.getDeal(creds, 'x'), /deal/],
    ['listNotes', (a) => a.listNotes(creds, { page: 1, limit: 10 }), /note/],
    ['getNote', (a) => a.getNote(creds, 'x'), /note/],
    ['listCompanies', (a) => a.listCompanies(creds, { page: 1, limit: 10 }), /GraphQL/],
    ['listActivities', (a) => a.listActivities(creds, { page: 1, limit: 10 }), /GraphQL/],
  ]
  it.each(CASES)('%s refuses', async (_name, call, reason) => {
    serve({ people: 3 })
    await expect(call(new CobraCrmAdapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(reason),
    })
    expect(requests).toHaveLength(0)
  })
})
