/**
 * Qontak CRM adapter — requests against the documented API.
 *
 * Every path, parameter and header the fakes accept is from Qontak's CRM
 * OpenAPI (https://raw.githubusercontent.com/qontak-dev/docs/master/Qontak-CRM-OpenAPI-MAG.json):
 * host https://api.mekari.com, HMAC `Authorization` + `Date` +
 * `X-Crm-User-Sso-Id`, `page`/`per_page` on GET /qontak/crm/deals only.
 */
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { QontakAdapter } from '../../../../../../src/verticals/crm/adapters/qontak'
import {
  dealsList,
  contactGet,
  contactsList,
  companiesList,
  tasksList,
  notesList,
  pipelinesList,
  dealGet,
} from './fixtures'

const CREDS: Credentials = {
  accessToken: 'hmac-user',
  extra: {
    clientId: 'hmac-user',
    clientSecret: 'hmac-secret',
    ssoId: '50c3d284-7b8b-460d-88bf-9cdde2bdbc26',
  },
}

interface Seen {
  method: string
  url: URL
  headers: Record<string, string>
}

let seen: Seen[] = []
let reply: (url: URL) => unknown

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  seen = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input)
      seen.push({
        method: init.method ?? 'GET',
        url,
        headers: init.headers as Record<string, string>,
      })
      if (url.origin !== 'https://api.mekari.com') return json({ error: 'unknown host' }, 599)
      return json(reply(url))
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new QontakAdapter()

function paramsFor(page: number, limit: number): QueryParams {
  return withPageSink({ page, limit } as QueryParams)
}

// ── Auth ──────────────────────────────────────────────────────────────────

describe('qontak HMAC signing', () => {
  it('signs `date: <Date>\\n<METHOD> <path?query> HTTP/1.1` with the secret, as documented', async () => {
    reply = () => dealsList
    await adapter.listDeals(CREDS, paramsFor(2, 10))
    expect(seen).toHaveLength(1)
    const { url, headers, method } = seen[0]!
    const date = headers['Date']!
    expect(new Date(date).toUTCString()).toBe(date)
    const expected = createHmac('sha256', 'hmac-secret')
      .update(`date: ${date}\n${method} ${url.pathname}${url.search} HTTP/1.1`)
      .digest('base64')
    expect(headers['Authorization']).toBe(
      `hmac username="hmac-user", algorithm="hmac-sha256", headers="date request-line", signature="${expected}"`,
    )
    expect(headers['X-Crm-User-Sso-Id']).toBe('50c3d284-7b8b-460d-88bf-9cdde2bdbc26')
  })

  it('refuses with 401 and sends nothing when a connection has no HMAC credentials', async () => {
    reply = () => dealsList
    await expect(
      adapter.listDeals({ accessToken: 'old-oauth-token' }, paramsFor(1, 10)),
    ).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(seen).toHaveLength(0)
  })

  it('refuses with 401 when only the user SSO id is missing', async () => {
    reply = () => dealsList
    const noSso: Credentials = { accessToken: 'u', extra: { clientId: 'u', clientSecret: 's' } }
    await expect(adapter.listDeals(noSso, paramsFor(1, 10))).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(seen).toHaveLength(0)
  })

  it('stores the three form fields on the connection', async () => {
    const creds = await adapter.exchangeCredentials({
      clientId: ' u ',
      clientSecret: 's',
      ssoId: 'sso',
    })
    expect(creds).toEqual({
      accessToken: 'u',
      extra: { clientId: 'u', clientSecret: 's', ssoId: 'sso' },
    })
    await expect(adapter.exchangeCredentials({ clientId: 'u', clientSecret: 's' })).rejects.toThrow(
      /SSO id/,
    )
  })
})

// ── Deals: upstream page/per_page ─────────────────────────────────────────

describe('qontak listDeals', () => {
  const L = 3
  const N = 2 * L + 1
  const template = dealsList.response[0]!
  const all = Array.from({ length: N }, (_, i) => ({
    ...template,
    id: i + 1,
    name: `Deal ${i + 1}`,
  }))

  beforeEach(() => {
    // Honours only the documented `page` and `per_page`.
    reply = (url) => {
      expect(url.pathname).toBe('/qontak/crm/deals')
      expect([...url.searchParams.keys()].sort()).toEqual(['page', 'per_page'])
      const page = Number(url.searchParams.get('page'))
      const per = Number(url.searchParams.get('per_page'))
      const totalPage = Math.ceil(N / per)
      return {
        meta: dealsList.meta,
        response: all.slice((page - 1) * per, page * per),
        page,
        total_page: totalPage,
        current_data: Math.max(0, Math.min(per, N - (page - 1) * per)),
        total_data: N,
      }
    }
  })

  it('sends the caller page and exact limit', async () => {
    await adapter.listDeals(CREDS, paramsFor(2, 7))
    expect(seen[0]!.url.searchParams.get('page')).toBe('2')
    expect(seen[0]!.url.searchParams.get('per_page')).toBe('7')
  })

  it('walks every deal once with an exact hasMore', async () => {
    const ids: string[] = []
    for (let page = 1; ; page++) {
      const params = paramsFor(page, L)
      const rows = await adapter.listDeals(CREDS, params)
      ids.push(...rows.map((d) => d.id))
      const meta = readUpstreamPage(params)!
      expect(meta.totalCount).toBe(N)
      expect(meta.hasMore).toBe(page < 3)
      if (!meta.hasMore) break
    }
    expect(ids).toEqual(all.map((d) => String(d.id)))
  })

  it('rejects 502 on a 200 body with no `response` array, never an empty page', async () => {
    reply = () => ({ meta: dealsList.meta, page: 1, total_page: 1 })
    await expect(adapter.listDeals(CREDS, paramsFor(1, L))).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})

// ── Whole-collection lists ────────────────────────────────────────────────

type ListName = 'listContacts' | 'listCompanies' | 'listActivities' | 'listNotes' | 'listPipelines'
const WHOLE: Array<[ListName, string, Record<string, unknown>]> = [
  ['listContacts', '/qontak/crm/contacts', contactsList.response[0]!],
  ['listCompanies', '/qontak/crm/companies', companiesList.response[0]!],
  ['listActivities', '/qontak/crm/tasks', tasksList.response[0]!],
  ['listNotes', '/qontak/crm/notes', notesList.response[0]!],
  ['listPipelines', '/qontak/crm/pipelines', pipelinesList.response[0]!],
]

describe.each(WHOLE)('qontak %s', (method, path, template) => {
  const L = 2
  const N = 2 * L + 1
  const all = Array.from({ length: N }, (_, i) => ({ ...template, id: i + 1 }))

  it('asks for the documented path with no undocumented paging params', async () => {
    reply = () => ({ response: all, page: 1, total_page: 1, current_data: N, total_data: N })
    await adapter[method](CREDS, paramsFor(1, L))
    expect(seen).toHaveLength(1)
    expect(seen[0]!.url.pathname).toBe(path)
    expect(seen[0]!.url.search).toBe('')
  })

  it('cuts the whole collection into caller pages, every id once, hasMore exact', async () => {
    reply = () => ({ response: all, page: 1, total_page: 1, current_data: N, total_data: N })
    const ids: string[] = []
    for (let page = 1; page <= 3; page++) {
      const params = paramsFor(page, L)
      const rows = await adapter[method](CREDS, params)
      ids.push(...rows.map((r) => r.id))
      const meta = readUpstreamPage(params)!
      expect(meta.totalCount).toBe(N)
      expect(meta.hasMore).toBe(page < 3)
      expect(meta.pagedLocally).toBe(true)
    }
    expect(ids).toEqual(all.map((r) => String(r.id)))
  })

  it('rejects 502 on a 200 body with no `response` array, never an empty collection', async () => {
    reply = () => ({ page: 1, total_page: 1 })
    await expect(adapter[method](CREDS, paramsFor(1, L))).rejects.toMatchObject({
      statusCode: 502,
    })
  })

  it('refuses 501 NOT_SUPPORTED when the response reports more than one page', async () => {
    reply = () => ({ response: all, page: 1, total_page: 2, current_data: N, total_data: 2 * N })
    await expect(adapter[method](CREDS, paramsFor(1, L))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
  })
})

// ── Single records ────────────────────────────────────────────────────────

describe('qontak get*', () => {
  it('getDeal reads the record under `response` from /qontak/crm/deals/{id}', async () => {
    reply = () => dealGet
    const d = await adapter.getDeal(CREDS, '1')
    expect(seen[0]!.url.pathname).toBe('/qontak/crm/deals/1')
    expect(d.title).toBe('Deal A')
  })

  it('getContact picks the asked-for id from the documented array `response`', async () => {
    reply = () => ({
      ...contactGet,
      response: [{ ...contactGet.response[0]!, id: 9 }, contactGet.response[0]!],
    })
    const c = await adapter.getContact(CREDS, '1')
    expect(seen[0]!.url.pathname).toBe('/qontak/crm/contacts/1')
    expect(c.id).toBe('1')
  })

  it('throws 404 when the array holds no record with that id', async () => {
    reply = () => contactGet
    await expect(adapter.getContact(CREDS, '42')).rejects.toMatchObject({ statusCode: 404 })
  })

  it.each([
    ['getCompany', '/qontak/crm/companies/5'],
    ['getActivity', '/qontak/crm/tasks/5'],
    ['getNote', '/qontak/crm/notes/5'],
    ['getPipeline', '/qontak/crm/pipelines/5'],
  ] as const)('%s calls %s', async (method, path) => {
    reply = () => ({ response: { id: 5, name: 'x', note: 'x' } })
    await adapter[method](CREDS, '5')
    expect(seen[0]!.url.pathname).toBe(path)
  })
})
