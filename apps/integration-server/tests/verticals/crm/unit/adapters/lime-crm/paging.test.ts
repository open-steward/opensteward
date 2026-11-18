/**
 * Lime CRM list paging.
 *
 * The limeobject collections (`/person/`, `/company/`, `/deal/`) take `_limit`
 * ("The maximum number of items to return.", minimum 1, maximum 50, default 10)
 * and page by link: "The following next object page can be retrieved by
 * following the `next` link provided in the response."
 * (http://static.lime-crm.com/crm-api-docs/spec/limeobject). The responses are
 * HAL, so the link is `_links.next.href`. The objects are read from
 * `_embedded.limeobjects`, the envelope Lime Technologies' own client
 * (@limetech/n8n-nodes-lime-crm) types; any other body is an error. `_offset` is not documented; the
 * adapter once sent `_offset` from `params.offset`, which the router never
 * sets, so every page repeated page 1.
 *
 * The fake upstream honours ONLY the documented parameters: `_limit` (and it
 * rejects a value above 50), plus an opaque token that exists only inside the
 * `next` href it minted. A client that builds its own offset gets page 1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
} from '@opensteward/shared'
import { LimeCrmAdapter } from '../../../../../../src/verticals/crm/adapters/lime-crm/index'

const BASE = 'https://tenant.example.test/acme/api/v1'
const creds: Credentials = {
  accessToken: 'api-key',
  extra: { instanceUrl: BASE },
} as Credentials

interface Seen {
  url: URL
}

let seen: Seen[] = []

/**
 * A link-paged HAL collection. The next href carries an opaque token (`_pt`)
 * that the fake decodes; nothing about it is documented, so only an adapter
 * that follows the href verbatim reaches page 2.
 */
function halCollection(key: string, n: number, make: (i: number) => Record<string, unknown>) {
  const rows = Array.from({ length: n }, (_, i) => make(i + 1))
  const tokens = new Map<string, number>()
  let minted = 0
  return (url: URL): Response => {
    const raw = url.searchParams.get('_limit')
    const size = raw === null ? 10 : Number(raw)
    if (!Number.isInteger(size) || size < 1 || size > 50) {
      return new Response(`_limit out of range: ${raw}`, { status: 400 })
    }
    let start = 0
    const token = url.searchParams.get('_pt')
    if (token !== null) {
      const at = tokens.get(token)
      if (at === undefined) return new Response(`unknown token ${token}`, { status: 400 })
      start = at
    }
    const page = rows.slice(start, start + size)
    const end = start + page.length
    const body: Record<string, unknown> = { _embedded: { [key]: page } }
    if (end < rows.length) {
      const t = `t${++minted}x${end}`
      tokens.set(t, end)
      const next = new URL(url.toString())
      next.search = ''
      next.searchParams.set('_limit', String(size))
      next.searchParams.set('_pt', t)
      body['_links'] = { next: { href: next.toString() } }
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/hal+json' },
    })
  }
}

function install(routes: Record<string, (url: URL) => Response>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      seen.push({ url })
      const route = routes[`${url.origin}${url.pathname}`]
      if (!route) return new Response('not found', { status: 404 })
      return route(url)
    }),
  )
}

const person = (i: number) => ({ _id: String(i), firstname: `P${i}` })
const company = (i: number) => ({ _id: String(i), name: `C${i}` })
const deal = (i: number) => ({ _id: String(i), name: `D${i}` })

beforeEach(() => {
  seen = []
  _resetCursorPager()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type ListMethod = 'listContacts' | 'listCompanies' | 'listDeals'

describe.each<[ListMethod, string, string, (i: number) => Record<string, unknown>]>([
  ['listContacts', '/limeobject/person/', 'limeobjects', person],
  ['listCompanies', '/limeobject/company/', 'limeobjects', company],
  ['listDeals', '/limeobject/deal/', 'limeobjects', deal],
])('lime-crm %s follows the next link', (method, path, key, make) => {
  const L = 3
  const N = 2 * L + 1
  const route = `${BASE}${path}`

  it('serves every row once, in order, with exact hasMore', async () => {
    install({ [route]: halCollection(key, N, make) })
    const adapter = new LimeCrmAdapter()
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter[method](creds, params)
      ids.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(more).toEqual([true, true, false])
  })

  it('sends _limit on page 1 and follows the documented next link on page 2', async () => {
    install({ [route]: halCollection(key, N, make) })
    const adapter = new LimeCrmAdapter()
    await adapter[method](creds, withPageSink({ page: 1, limit: L }))
    await adapter[method](creds, withPageSink({ page: 2, limit: L }))
    expect(seen[0]!.url.searchParams.get('_limit')).toBe(String(L))
    expect(seen[0]!.url.searchParams.has('_offset')).toBe(false)
    expect(seen[0]!.url.searchParams.has('_pt')).toBe(false)
    expect(seen[1]!.url.searchParams.get('_pt')).toMatch(/^t\d+x3$/)
    expect(seen[1]!.url.searchParams.get('_limit')).toBe(String(L))
  })

  it('reaches page 2 cold by walking from page 1', async () => {
    install({ [route]: halCollection(key, N, make) })
    const rows = await new LimeCrmAdapter()[method](creds, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
  })

  it('a limit above the documented maximum of 50 is clamped and still serves every row', async () => {
    const big = 120
    install({ [route]: halCollection(key, big, make) })
    const adapter = new LimeCrmAdapter()
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await adapter[method](creds, params)
      ids.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pageSize).toBe(50)
    }
    for (const s of seen) expect(s.url.searchParams.get('_limit')).toBe('50')
    expect(ids).toEqual(Array.from({ length: big }, (_, i) => String(i + 1)))
    expect(more).toEqual([true, true, false])
  })

  it('reports no pageSize when the limit is within the documented maximum', async () => {
    install({ [route]: halCollection(key, N, make) })
    const params = withPageSink({ page: 1, limit: L })
    await new LimeCrmAdapter()[method](creds, params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('a cursor minted at one limit is not reused for another limit', async () => {
    install({ [route]: halCollection(key, 20, make) })
    const adapter = new LimeCrmAdapter()
    await adapter[method](creds, withPageSink({ page: 1, limit: 3 }))
    const rows = await adapter[method](creds, withPageSink({ page: 2, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(['6', '7', '8', '9', '10'])
  })

  it('each connection walks with its own cursor and its own API key', async () => {
    // Tokens are bound to the API key that minted them: another key is refused.
    const inner = halCollection(key, N, make)
    const owner = new Map<string, string>()
    const keysSeen: Array<[string | null, string]> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: { headers?: Record<string, string> }) => {
        const url = new URL(input)
        const apiKey = init?.headers?.['x-api-key'] ?? ''
        keysSeen.push([url.searchParams.get('_pt'), apiKey])
        const pt = url.searchParams.get('_pt')
        if (pt !== null && owner.get(pt) !== apiKey) {
          return new Response('token belongs to another key', { status: 403 })
        }
        const res = inner(url)
        const body = (await res
          .clone()
          .json()
          .catch(() => null)) as {
          _links?: { next?: { href: string } }
        } | null
        const nextHref = body?._links?.next?.href
        if (nextHref) owner.set(new URL(nextHref).searchParams.get('_pt')!, apiKey)
        return res
      }),
    )
    const a: Credentials = { accessToken: 'key-a', extra: { instanceUrl: BASE } } as Credentials
    const b: Credentials = { accessToken: 'key-b', extra: { instanceUrl: BASE } } as Credentials
    const adapter = new LimeCrmAdapter()
    await adapter[method](a, withPageSink({ page: 1, limit: L }))
    const rowsB = await adapter[method](b, withPageSink({ page: 2, limit: L }))
    const rowsA = await adapter[method](a, withPageSink({ page: 2, limit: L }))
    expect(rowsB.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(rowsA.map((r) => r.id)).toEqual(['4', '5', '6'])
    for (const [pt, k] of keysSeen) if (pt !== null) expect(owner.get(pt)).toBe(k)
  })

  it('does not send the API key to a next link on another origin', async () => {
    install({
      [route]: () =>
        new Response(
          JSON.stringify({
            _embedded: { [key]: [make(1)] },
            _links: { next: { href: `https://evil.example.test${path}?_pt=x` } },
          }),
          { status: 200 },
        ),
    })
    const adapter = new LimeCrmAdapter()
    await adapter[method](creds, withPageSink({ page: 1, limit: 1 }))
    await expect(adapter[method](creds, withPageSink({ page: 2, limit: 1 }))).rejects.toThrow(
      /origin/,
    )
    expect(seen.every((s) => s.url.hostname === 'tenant.example.test')).toBe(true)
  })

  it.each([
    ['a bare array', [{ _id: 1 }]],
    ['another embedded relation', { _embedded: { 'limeobject:x': [{ _id: 1 }] } }],
    ['no _embedded', {}],
  ])('a body with %s is an error, never an empty complete page', async (_label, body) => {
    install({ [route]: () => new Response(JSON.stringify(body), { status: 200 }) })
    const params = withPageSink({ page: 1, limit: L })
    await expect(new LimeCrmAdapter()[method](creds, params)).rejects.toMatchObject({
      code: 'UPSTREAM_SHAPE',
    })
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  // Lime CRM declares no maxPageSize (listPipelines is not fixed), so the
  // router passes no adapter here.
  it('through the API path, meta.hasMore is exact', async () => {
    install({ [route]: halCollection(key, N, make) })
    const adapter = new LimeCrmAdapter()
    const params = parseListQuery({ limit: String(L), page: '1' })
    const env = listPage<{ id: string }>(await adapter[method](creds, params), params, 'lime-crm')
    expect(env.meta.hasMore).toBe(true)
    expect(env.data).toHaveLength(L)

    const last = parseListQuery({ limit: String(L), page: '3' })
    const envLast = listPage<{ id: string }>(await adapter[method](creds, last), last, 'lime-crm')
    expect(envLast.meta.hasMore).toBe(false)
    expect(envLast.data.map((r) => r.id)).toEqual([String(N)])
  })
})
