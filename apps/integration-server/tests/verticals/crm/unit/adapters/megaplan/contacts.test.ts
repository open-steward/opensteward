import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { MegaplanAdapter } from '../../../../../../src/verticals/crm/adapters/megaplan/index'
import {
  CREDENTIAL_FORM,
  normaliseMegaplanAccount,
} from '../../../../../../src/verticals/crm/adapters/megaplan/auth'
import { ContactSchema } from '../../../../../../src/verticals/crm/schema/contact'

/**
 * Megaplan API v3 (https://dev.megaplan.ru/apiv3/index.html):
 * - every GET carries its parameters as one JSON document: "Все параметры
 *   запроса отправляются в виде JSON … в GET параметрах, например
 *   GET /api/v3/currency?{"limit": "3"}"; a form query gets 422;
 * - "limit указание макисмального количества сущностей в ответе. По умолчанию
 *   равен 100. pageAfter принимает линк-сущность и отобразит limit элементов,
 *   начиная с переданного." — the first-party SDK passes the LAST row of the
 *   previous page ("Последний объект из предыдущего результата для
 *   последовательной загрузки"), so the fake serves the rows after it;
 * - "С пагинируемой коллекцией в metadata обязательно возвращается поле
 *   pagination с полями: count … limit".
 */

const HOST = 'https://acme.megaplan.ru'
const creds = { accessToken: 'tok', extra: { baseUrl: HOST } }

interface Seen {
  url: URL
  query: Record<string, unknown> | undefined
  auth: string | null
}
let requests: Seen[] = []

function row(i: number, contentType = 'ContractorHuman') {
  return { contentType, id: String(1000 + i), firstName: `F${i}`, lastName: `L${i}` }
}

/** Fake account honouring only documented parameters. */
function serve(rows: ReturnType<typeof row>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      const raw = url.search.slice(1)
      let query: Record<string, unknown> | undefined
      if (raw) {
        try {
          query = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>
        } catch {
          requests.push({ url, query: undefined, auth: null })
          return json({ meta: { status: 422, errors: ['Query string should be json'] } }, 422)
        }
      }
      const auth = new Headers(init?.headers).get('authorization')
      requests.push({ url, query, auth })
      if (url.origin !== HOST) return new Response('Аккаунт не найден', { status: 404 })
      const byId = /^\/api\/v3\/contractor\/([^/]+)$/.exec(url.pathname)
      if (byId) {
        const hit = rows.find((r) => r.id === decodeURIComponent(byId[1]!))
        return hit ? json({ meta: { status: 200, errors: [] }, data: hit }) : json({}, 404)
      }
      if (url.pathname !== '/api/v3/contractorHuman') return json({}, 404)
      const limit = typeof query?.['limit'] === 'number' ? (query['limit'] as number) : 100
      const after = query?.['pageAfter'] as { id?: string; contentType?: string } | undefined
      let start = 0
      if (after) {
        const at = rows.findIndex((r) => r.id === after.id && r.contentType === after.contentType)
        if (at < 0) return json({ meta: { status: 422, errors: ['bad pageAfter'] } }, 422)
        start = at + 1
      }
      const size = limit
      return json({
        meta: { status: 200, errors: [], pagination: { count: rows.length, limit: size } },
        data: rows.slice(start, start + size),
      })
    }),
  )
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  requests = []
  _resetCursorPager()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('megaplan listContacts', () => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(Array.from({ length: 2 * L + 1 }, (_, i) => row(i + 1)))
    const adapter = new MegaplanAdapter()
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    const totals: (number | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const out = await adapter.listContacts(creds, params)
      out.forEach((c) => ContactSchema.parse(c))
      ids.push(...out.map((c) => c.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      totals.push(readUpstreamPage(params)?.totalCount)
    }
    expect(ids).toEqual(['1001', '1002', '1003', '1004', '1005', '1006', '1007'])
    expect(new Set(ids).size).toBe(7)
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([7, 7, 7])
    // Sequential walk: one request per page.
    expect(requests).toHaveLength(3)
  })

  it('reports hasMore false on a page that ends exactly at count', async () => {
    serve(Array.from({ length: 6 }, (_, i) => row(i + 1)))
    const adapter = new MegaplanAdapter()
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: 3 }))
    const params = withPageSink({ page: 2, limit: 3 })
    const out = await adapter.listContacts(creds, params)
    expect(out.map((c) => c.id)).toEqual(['1004', '1005', '1006'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests).toHaveLength(2)
  })

  it('sends the query as one JSON document with the caller limit, and pageAfter as the last row link entity', async () => {
    serve(Array.from({ length: 7 }, (_, i) => row(i + 1)))
    const adapter = new MegaplanAdapter()
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: 3 }))
    await adapter.listContacts(creds, withPageSink({ page: 2, limit: 3 }))
    expect(requests.map((r) => r.url.origin + r.url.pathname)).toEqual([
      `${HOST}/api/v3/contractorHuman`,
      `${HOST}/api/v3/contractorHuman`,
    ])
    // Not a form query: no `limit=` pair.
    expect(requests[0]!.url.searchParams.has('limit')).toBe(false)
    expect(requests[0]!.query).toMatchObject({ limit: 3 })
    expect(requests[0]!.query).not.toHaveProperty('pageAfter')
    expect(requests[1]!.query).toMatchObject({
      limit: 3,
      pageAfter: { contentType: 'ContractorHuman', id: '1003' },
    })
    expect(requests[0]!.query!['fields']).toEqual(
      expect.arrayContaining([
        'contactInfo',
        'responsibles',
        'company',
        'timeCreated',
        'timeUpdated',
      ]),
    )
    expect(Object.keys(requests[0]!.query!).sort()).toEqual(['fields', 'limit'])
    expect(requests[0]!.auth).toBe('Bearer tok')
  })

  it('walks from page 1 when page 3 is asked for cold', async () => {
    serve(Array.from({ length: 7 }, (_, i) => row(i + 1)))
    const params = withPageSink({ page: 3, limit: 3 })
    const out = await new MegaplanAdapter().listContacts(creds, params)
    expect(out.map((c) => c.id)).toEqual(['1007'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests).toHaveLength(3)
  })

  it('sends the documented default of 100 when the caller gives no limit', async () => {
    serve([row(1)])
    await new MegaplanAdapter().listContacts(creds, withPageSink({}))
    expect(requests[0]!.query).toMatchObject({ limit: 100 })
  })

  it('pages after the last raw row even when it is a company, and serves only humans', async () => {
    serve([row(1), row(2, 'ContractorCompany'), row(3), row(4)])
    const adapter = new MegaplanAdapter()
    const p1 = withPageSink({ page: 1, limit: 2 })
    const first = await adapter.listContacts(creds, p1)
    expect(first.map((c) => c.id)).toEqual(['1001'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 2 })
    const second = await adapter.listContacts(creds, p2)
    expect(second.map((c) => c.id)).toEqual(['1003', '1004'])
    expect(requests[1]!.query).toMatchObject({
      pageAfter: { contentType: 'ContractorCompany', id: '1002' },
    })
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('stops on an empty page even if count claims more', async () => {
    const rows = [row(1)]
    serve(rows)
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockImplementationOnce(async () =>
      json({ meta: { status: 200, errors: [], pagination: { count: 5, limit: 3 } }, data: [] }),
    )
    const params = withPageSink({ page: 1, limit: 3 })
    const out = await new MegaplanAdapter().listContacts(creds, params)
    expect(out).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('throws rather than guessing the end when meta.pagination.count is missing', async () => {
    serve([])
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () =>
      json({ meta: { status: 200, errors: [] }, data: [row(1)] }),
    )
    await expect(
      new MegaplanAdapter().listContacts(creds, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(/pagination\.count/)
  })

  it('refuses a connection with no account host before sending anything', async () => {
    serve([row(1)])
    await expect(
      new MegaplanAdapter().listContacts(
        { accessToken: 'tok' },
        withPageSink({ page: 1, limit: 3 }),
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MISSING_CREDENTIAL' })
    expect(requests).toHaveLength(0)
  })

  it('serves every row once if pageAfter turns out to include the passed row', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => row(i + 1))
    serve(rows)
    // An inclusive pageAfter: the page starts AT the passed entity.
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = new URL(input as string)
      const query = JSON.parse(decodeURIComponent(url.search.slice(1))) as {
        limit: number
        pageAfter?: { id: string }
      }
      requests.push({ url, query, auth: null })
      const start = query.pageAfter ? rows.findIndex((r) => r.id === query.pageAfter!.id) : 0
      return json({
        meta: { status: 200, errors: [], pagination: { count: rows.length, limit: query.limit } },
        data: rows.slice(start, start + query.limit),
      })
    })
    const adapter = new MegaplanAdapter()
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 3 })
      ids.push(...(await adapter.listContacts(creds, params)).map((c) => c.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(['1001', '1002', '1003', '1004', '1005', '1006', '1007'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('does not drop a first row that is not the passed entity', async () => {
    serve(Array.from({ length: 4 }, (_, i) => row(i + 1)))
    const adapter = new MegaplanAdapter()
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: 2 }))
    const out = await adapter.listContacts(creds, withPageSink({ page: 2, limit: 2 }))
    expect(out.map((c) => c.id)).toEqual(['1003', '1004'])
  })

  it('throws when the response has no data array', async () => {
    serve([])
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () =>
      json({ meta: { status: 200, errors: [], pagination: { count: 0, limit: 3 } } }),
    )
    await expect(
      new MegaplanAdapter().listContacts(creds, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(/no data array/)
  })

  it('refuses to page after a last row with no contentType', async () => {
    serve([])
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () =>
      json({
        meta: { status: 200, errors: [], pagination: { count: 5, limit: 1 } },
        data: [{ id: '1001' }],
      }),
    )
    await expect(
      new MegaplanAdapter().listContacts(creds, withPageSink({ page: 2, limit: 1 })),
    ).rejects.toThrow(/id\/contentType/)
    expect(requests).toHaveLength(0)
  })

  it('keeps separate walks for accounts on different hosts with the same token', async () => {
    const other = 'https://beta.megaplan.ru'
    const rows = Array.from({ length: 4 }, (_, i) => row(i + 1))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = new URL(input)
        const query = JSON.parse(decodeURIComponent(url.search.slice(1))) as {
          limit: number
          pageAfter?: { id: string }
        }
        requests.push({ url, query, auth: null })
        const start = query.pageAfter ? rows.findIndex((r) => r.id === query.pageAfter!.id) + 1 : 0
        return json({
          meta: { status: 200, errors: [], pagination: { count: rows.length, limit: query.limit } },
          data: rows.slice(start, start + query.limit),
        })
      }),
    )
    const adapter = new MegaplanAdapter()
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: 2 }))
    requests = []
    await adapter.listContacts(
      { accessToken: 'tok', extra: { baseUrl: other } },
      withPageSink({ page: 2, limit: 2 }),
    )
    // Cold on the other host: walks its page 1 first.
    expect(requests.map((r) => r.url.origin)).toEqual([other, other])
    expect(requests[0]!.query).not.toHaveProperty('pageAfter')
  })

  it('keeps separate walks for different limits', async () => {
    serve(Array.from({ length: 7 }, (_, i) => row(i + 1)))
    const adapter = new MegaplanAdapter()
    await adapter.listContacts(creds, withPageSink({ page: 1, limit: 3 }))
    const out = await adapter.listContacts(creds, withPageSink({ page: 2, limit: 2 }))
    expect(out.map((c) => c.id)).toEqual(['1003', '1004'])
  })
})

describe('megaplan getContact', () => {
  it('reads GET /api/v3/contractor/{id} on the account host with no query', async () => {
    serve([row(1), row(2)])
    const out = await new MegaplanAdapter().getContact(creds, '1002')
    expect(ContactSchema.parse(out).id).toBe('1002')
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url.href).toBe(`${HOST}/api/v3/contractor/1002`)
    expect(requests[0]!.auth).toBe('Bearer tok')
  })

  it('encodes the id as one path segment', async () => {
    serve([row(1)])
    await expect(new MegaplanAdapter().getContact(creds, 'a/b')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(requests[0]!.url.pathname).toBe('/api/v3/contractor/a%2Fb')
  })

  it('answers 404 for a company id: a company is not a contact', async () => {
    serve([row(1, 'ContractorCompany')])
    await expect(new MegaplanAdapter().getContact(creds, '1001')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('refuses a connection with no account host before sending anything', async () => {
    serve([row(1)])
    await expect(
      new MegaplanAdapter().getContact({ accessToken: 'tok' }, '1001'),
    ).rejects.toMatchObject({
      code: 'MISSING_CREDENTIAL',
    })
    expect(requests).toHaveLength(0)
  })
})

describe('megaplan Connect Link form', () => {
  it('collects the account and the token', () => {
    expect(new MegaplanAdapter().credentialFields().map((f) => f.name)).toEqual([
      'account',
      'apiKey',
    ])
  })

  it('stores the account host as extra.baseUrl, which the client reads', async () => {
    const out = await CREDENTIAL_FORM.exchangeCredentials({ account: 'Acme', apiKey: ' tok ' })
    expect(out).toEqual({ accessToken: 'tok', extra: { baseUrl: HOST } })
    serve([row(1)])
    await new MegaplanAdapter().listContacts(out, withPageSink({ page: 1, limit: 3 }))
    expect(requests[0]!.url.origin).toBe(HOST)
  })

  it.each([
    ['acme', HOST],
    ['acme.megaplan.ru', HOST],
    ['https://acme.megaplan.ru/crm/', HOST],
  ])('normalises %s', (input, want) => {
    expect(normaliseMegaplanAccount(input)).toBe(want)
  })

  it.each(['', 'evil.example.com', 'a.b.megaplan.ru'])('rejects %j', (input) => {
    expect(() => normaliseMegaplanAccount(input)).toThrow()
  })

  it('requires the token', async () => {
    await expect(
      CREDENTIAL_FORM.exchangeCredentials({ account: 'acme', apiKey: '' }),
    ).rejects.toThrow()
  })
})
