/**
 * SuperOffice: auth, tenant base URL, request shapes and paging.
 *
 * Auth — https://docs.superoffice.com/en/api/authentication/online/sign-in-user/auth-code-flow:
 *   "GET Request https://sod.superoffice.com/login/common/oauth/authorize?"
 *   scope: "yes — Must be `openid`."
 *   "POST https://sod.superoffice.com/login/common/oauth/tokens?"
 *   token response: token_type, access_token, expires_in, refresh_token, id_token
 * Production login host — developer-portal/getting-started/app-envir: "Production
 *   `https://online.superoffice.com`".
 * Tenant base — authentication/online/validate-security-tokens: claim
 *   "http://schemes.superoffice.net/identity/webapi_url" "The URL to a tenant REST web services."
 *
 * Lists — search/odata/index: $select, $orderBy, $top "Number of rows to return in
 * results", $skip "Number of rows from database to skip before returning results",
 * $output "Logical returns true/false for booleans". Responses are ODataSlimResponse
 * { odata.metadata, odata.nextLink, value }.
 *
 * Pipelines — GET /api/v1/List/SaleType/Items, "Gets a list of all SaleTypeEntity
 * list items.", query parameter `includeDeleted` only.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import {
  SuperOfficeAdapter,
  webApiBaseFromIdToken,
} from '../../../../../../src/verticals/crm/adapters/superoffice/index'

const BASE = 'https://online2.superoffice.com/Cust12345/api/v1'
const CREDS = { accessToken: '8A:Cust12345.token', extra: { instanceUrl: BASE } }
const WEBAPI_CLAIM = 'http://schemes.superoffice.net/identity/webapi_url'

function idToken(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${enc({ typ: 'JWT', alg: 'RS256' })}.${enc(claims)}.signature`
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── A fake tenant that honours only documented parameters ─────────────────

const ODATA_PARAMS = new Set(['$select', '$orderBy', '$top', '$skip', '$output'])

interface Collection {
  pk: string
  rows: (i: number) => Record<string, unknown>
}

const COLLECTIONS: Record<string, Collection> = {
  '/Person': { pk: 'personId', rows: (i) => ({ firstName: `F${i}`, lastName: `L${i}` }) },
  '/Contact': { pk: 'contactId', rows: (i) => ({ name: `Company ${i}` }) },
  '/Sale': { pk: 'saleId', rows: (i) => ({ heading: `Sale ${i}` }) },
  '/Appointment': {
    pk: 'appointmentId',
    rows: (i) => ({ text: `Appt ${i}`, completed: i % 2 === 0 }),
  },
}

function fakeTenant(total: number, saleTypes: Record<string, unknown>[] = []) {
  const calls: URL[] = []
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input))
    calls.push(url)
    if (!url.href.startsWith(`${BASE}/`)) return new Response('wrong host', { status: 404 })
    const path = url.pathname.slice(new URL(BASE).pathname.length)
    if (path === '/List/SaleType/Items') {
      for (const k of url.searchParams.keys()) {
        if (k !== 'includeDeleted') return new Response(`unknown ${k}`, { status: 400 })
      }
      return Response.json(saleTypes)
    }
    const col = COLLECTIONS[path]
    if (!col) return new Response('not found', { status: 404 })
    for (const k of url.searchParams.keys()) {
      if (!ODATA_PARAMS.has(k)) return new Response(`unknown ${k}`, { status: 400 })
    }
    const top = Number(url.searchParams.get('$top') ?? 50)
    const skip = Number(url.searchParams.get('$skip') ?? 0)
    // Unordered storage: rows come back in id order only when $orderBy asks for it.
    let ids = Array.from({ length: total }, (_, i) => total - i)
    if (url.searchParams.get('$orderBy') === col.pk) ids = ids.sort((a, b) => a - b)
    const page = ids.slice(skip, skip + top)
    const body: Record<string, unknown> = {
      'odata.metadata': `${BASE}${path}/$metadata`,
      value: page.map((id) => ({ PrimaryKey: String(id), EntityName: 'x', ...col.rows(id) })),
    }
    if (skip + top < total)
      body['odata.nextLink'] = `${BASE}${path}?$skip=${skip + top}&$top=${top}`
    return Response.json(body)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

// ── Auth ──────────────────────────────────────────────────────────────────

describe('superoffice auth', () => {
  const adapter = new SuperOfficeAdapter({
    clientId: 'app-id',
    clientSecret: 'app-secret',
    redirectUri: 'https://app.example/cb',
  })

  it('authorizes at the production /login/common/ endpoint with scope openid', () => {
    const url = new URL(adapter.getAuthUrl('st4te'))
    expect(url.origin + url.pathname).toBe(
      'https://online.superoffice.com/login/common/oauth/authorize',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'app-id',
      scope: 'openid',
      redirect_uri: 'https://app.example/cb',
      state: 'st4te',
      response_type: 'code',
    })
  })

  it('adds a Connect Link scope override to the required openid scope, never dropping it', () => {
    expect(new URL(adapter.getAuthUrl('s', ['webapi'])).searchParams.get('scope')).toBe(
      'openid webapi',
    )
    expect(new URL(adapter.getAuthUrl('s', ['openid'])).searchParams.get('scope')).toBe('openid')
    expect(new URL(adapter.getAuthUrl('s', [])).searchParams.get('scope')).toBe('openid')
  })

  it('exchanges the code at /login/common/oauth/tokens and stores the webapi_url tenant base', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        token_type: 'Bearer',
        access_token: 'at',
        expires_in: 3600,
        refresh_token: 'rt',
        id_token: idToken({ [WEBAPI_CLAIM]: 'https://online2.superoffice.com/Cust12345/api/' }),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const creds = await adapter.exchangeCode('the-code', 'https://app.example/cb')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://online.superoffice.com/login/common/oauth/tokens')
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      client_id: 'app-id',
      client_secret: 'app-secret',
      code: 'the-code',
      redirect_uri: 'https://app.example/cb',
      grant_type: 'authorization_code',
    })
    expect(creds.accessToken).toBe('at')
    expect(creds.refreshToken).toBe('rt')
    expect(creds.extra).toEqual({ instanceUrl: BASE })
  })

  it('refuses a token response without the webapi_url claim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ access_token: 'at', id_token: idToken({ sub: 'x' }) })),
    )
    await expect(adapter.exchangeCode('c', 'https://app.example/cb')).rejects.toThrow(/webapi_url/)
  })

  it('refresh keeps the refresh token and re-reads the tenant base from the new id_token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          token_type: 'Bearer',
          access_token: 'at2',
          expires_in: 3600,
          id_token: idToken({ [WEBAPI_CLAIM]: 'https://app.superoffice.com/Cust12345/api/' }),
        }),
      ),
    )
    const next = await adapter.refreshCredentials({ ...CREDS, refreshToken: 'rt' })
    expect(next.accessToken).toBe('at2')
    expect(next.refreshToken).toBe('rt')
    expect(next.extra?.['instanceUrl']).toBe('https://app.superoffice.com/Cust12345/api/v1')
  })

  it('refresh keeps the stored tenant base when the new id_token has no webapi_url claim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ access_token: 'at3', expires_in: 3600, id_token: idToken({ sub: 'x' }) }),
      ),
    )
    const next = await adapter.refreshCredentials({ ...CREDS, refreshToken: 'rt' })
    expect(next.accessToken).toBe('at3')
    expect(next.extra?.['instanceUrl']).toBe(BASE)
  })

  it('reads webapi_url only from a well-formed token', () => {
    expect(webApiBaseFromIdToken(undefined)).toBeUndefined()
    expect(webApiBaseFromIdToken('not-a-jwt')).toBeUndefined()
    expect(
      webApiBaseFromIdToken(idToken({ [WEBAPI_CLAIM]: 'http://insecure/api/' })),
    ).toBeUndefined()
  })

  it('a connection without a tenant base fails with 401 and sends nothing', async () => {
    const { fetchMock } = fakeTenant(3)
    await expect(
      adapter.listContacts({ accessToken: 't' }, { page: 1, limit: 2 }),
    ).rejects.toMatchObject({
      statusCode: 401,
    })
    await expect(adapter.listPipelines({ accessToken: 't', extra: {} }, {})).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ── OData lists ───────────────────────────────────────────────────────────

type ListMethod = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities'

const LISTS: {
  method: ListMethod
  path: string
  select: string
  orderBy: string
  output?: string
}[] = [
  {
    method: 'listContacts',
    path: '/Person',
    select: 'firstName,lastName,title,contactId,personRegisteredDate,personUpdatedDate',
    orderBy: 'personId',
  },
  {
    method: 'listCompanies',
    path: '/Contact',
    select: 'name,registeredDate,updatedDate',
    orderBy: 'contactId',
  },
  {
    method: 'listDeals',
    path: '/Sale',
    select: 'heading,saleStatus,stageName,saleTypeId,probPercent,date,registeredDate,updatedDate',
    orderBy: 'saleId',
  },
  {
    method: 'listActivities',
    path: '/Appointment',
    select: 'type,text,saleId,completed,date,registeredDate,updatedDate',
    orderBy: 'appointmentId',
    output: 'Logical',
  },
]

describe.each(LISTS)('superoffice $method', ({ method, path, select, orderBy, output }) => {
  const adapter = new SuperOfficeAdapter()

  it(`GETs ${path} on the tenant base with the caller's page as $top/$skip`, async () => {
    const { calls } = fakeTenant(20)
    await adapter[method](CREDS, { page: 3, limit: 4 })
    expect(calls).toHaveLength(1)
    const url = calls[0]
    expect(url.origin + url.pathname).toBe(`${BASE}${path}`)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      $select: select,
      $orderBy: orderBy,
      $top: '4',
      $skip: '8',
      ...(output ? { $output: output } : {}),
    })
  })

  it('sends the access token as a Bearer Authorization header', async () => {
    const { fetchMock } = fakeTenant(1)
    await adapter[method](CREDS, { page: 1, limit: 1 })
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${CREDS.accessToken}`,
    )
  })

  it("sends the caller's limit as $top unclamped (no maximum is documented)", async () => {
    const { calls } = fakeTenant(3)
    await adapter[method](CREDS, { page: 1, limit: 500 })
    expect(calls[0].searchParams.get('$top')).toBe('500')
    expect(calls[0].searchParams.get('$skip')).toBe('0')
  })

  it('walks N = 2L+1 rows: every id once, hasMore from odata.nextLink', async () => {
    const L = 5
    const N = 2 * L + 1
    fakeTenant(N)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter[method](CREDS, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(hasMore).toEqual([true, true, undefined])
  })

  it('throws on a response that is not an OData value list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([])),
    )
    await expect(adapter[method](CREDS, { page: 1, limit: 2 })).rejects.toThrow(/OData "value"/)
  })
})

// ── Pipelines ─────────────────────────────────────────────────────────────

describe('superoffice listPipelines', () => {
  const adapter = new SuperOfficeAdapter()
  const saleType = (i: number) => ({
    SaleTypeId: i,
    Name: `Type ${i}`,
    Deleted: false,
    Stages: [{ Id: 10 + i, Name: `Stage ${i}`, Selected: true, Deleted: false }],
  })

  it('GETs /List/SaleType/Items with no paging parameters', async () => {
    const { calls } = fakeTenant(0, [saleType(1)])
    const out = await adapter.listPipelines(CREDS, { page: 1, limit: 10 })
    expect(calls).toHaveLength(1)
    expect(calls[0].href).toBe(`${BASE}/List/SaleType/Items`)
    expect(out.map((p) => p.id)).toEqual(['1'])
    expect(out[0].stages).toEqual([{ id: '11', name: 'Stage 1' }])
  })

  it('throws, rather than serving an empty list, on a response that is not an array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ value: [] })),
    )
    await expect(adapter.listPipelines(CREDS, { page: 1, limit: 2 })).rejects.toThrow(
      /List\/SaleType\/Items: response is not an array/,
    )
  })

  it('pages the whole list locally: N = 2L+1, every id once, hasMore exact', async () => {
    const L = 3
    const N = 2 * L + 1
    fakeTenant(
      0,
      Array.from({ length: N }, (_, i) => saleType(i + 1)),
    )
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listPipelines(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(hasMore).toEqual([true, true, false])
  })
})

// ── Single reads ──────────────────────────────────────────────────────────

describe('superoffice get methods', () => {
  const adapter = new SuperOfficeAdapter()

  it.each([
    ['getContact', '/Person/7', { PersonId: 7 }],
    ['getCompany', '/Contact/7', { ContactId: 7, Name: 'Co' }],
    ['getDeal', '/Sale/7', { SaleId: 7, Heading: 'S' }],
    ['getActivity', '/Appointment/7', { AppointmentId: 7 }],
  ] as const)('%s GETs %s on the tenant base', async (method, path, entity) => {
    const fetchMock = vi.fn(async () => Response.json(entity))
    vi.stubGlobal('fetch', fetchMock)
    const out = await adapter[method](CREDS, '7')
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(`${BASE}${path}`)
    expect(out.id).toBe('7')
  })
})
