/**
 * Productboard v1 lists page two ways
 * (https://developer.productboard.com/v1.0.0/reference/):
 *
 * - `/products`, `/components`, `/features`, `/users`: "only the first 100
 *   items are returned by default. The client should then recursively follow
 *   `links.next` link in the response to fetch the next page." No page-size
 *   or offset parameter is documented.
 * - `/notes`: `pageLimit` (1–2000, default 100) and a body-level
 *   `pageCursor` ("GET /notes?pageCursor={pageCursor} If there is no next
 *   page, this field is not present"), valid for one minute, 422 once expired.
 *
 * Every list used to send `pageLimit` and nothing else, so caller page 2
 * repeated page 1. The fakes below honour ONLY the documented parameters:
 * link lists ignore `pageLimit` and answer 100 rows a page, and a next page is
 * reachable only through the opaque `links.next` URL they minted; notes honour
 * `pageLimit` and a cursor they minted, for the same token and filter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetRowPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { ProductboardAdapter } from '../../../../../../src/verticals/projects/adapters/productboard/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok' }
/** A second connection to the same workspace, with another user's token. */
const C2: Credentials = { accessToken: 'tok2' }

const HOST = 'https://api.productboard.com'
/** Productboard's fixed page size for link-paginated lists. */
const LINK_PAGE = 100

interface Req {
  token: string
  url: string
  params: Record<string, unknown>
}

type LinkKind = 'products' | 'components' | 'features' | 'users'

interface LinkState {
  token: string
  path: string
  offset: number
  /** The `/features` filter the walk began with; a link carries it forward. */
  filter?: string
}

interface NoteCursor {
  token: string
  filter: string | undefined
  /** No doc says a cursor survives a pageLimit change, so the fake refuses one that is reused under another. */
  pageLimit: number
  offset: number
  expired: boolean
}

interface FakeOptions {
  /** Rows per link endpoint, per token. Absent endpoints hold none. */
  link?: Partial<Record<LinkKind, number>>
  /** Notes per (token, featureId). */
  notes?: number
}

/** `filter` is the `/features` project filter; features are partitioned by it. */
function linkId(kind: LinkKind, token: string, n: number, filter?: string): string {
  const scope = filter === undefined ? token : `${token}.${filter}`
  return `${kind}-${scope}-${String(n).padStart(4, '0')}`
}

function noteId(token: string, filter: string | undefined, n: number): string {
  return `note-${token}.${filter ?? 'all'}-${String(n).padStart(4, '0')}`
}

function linkRow(kind: LinkKind, id: string): Record<string, unknown> {
  switch (kind) {
    case 'users':
      return { id, name: id, email: `${id}@example.com` }
    default:
      return { id, name: id }
  }
}

function fakeProductboard(opts: FakeOptions, requests: Req[] = []) {
  const links = new Map<string, LinkState>()
  const cursors = new Map<string, NoteCursor>()
  let minted = 0
  let failCursorStatus: number | undefined
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const get = vi.fn(async (url: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, url, params })

      // ── /notes: pageLimit + pageCursor ──────────────────────────────────
      if (url === '/notes') {
        const pageLimit = params['pageLimit'] === undefined ? 100 : Number(params['pageLimit'])
        if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 2000)
          throw Object.assign(new Error(`pageLimit ${String(params['pageLimit'])}`), {
            response: { status: 400 },
          })
        const filter = params['featureId'] === undefined ? undefined : String(params['featureId'])
        let offset = 0
        if (params['pageCursor'] !== undefined) {
          if (failCursorStatus !== undefined)
            throw Object.assign(new Error(`HTTP ${failCursorStatus}`), {
              response: { status: failCursorStatus },
            })
          const c = cursors.get(String(params['pageCursor']))
          if (!c || c.expired)
            throw Object.assign(new Error('pageCursor is invalid or expired'), {
              response: { status: 422 },
            })
          if (c.token !== token) throw new Error('pageCursor minted for another user')
          if (c.filter !== filter) throw new Error('pageCursor minted for another filter')
          if (c.pageLimit !== pageLimit) throw new Error('pageCursor minted for another pageLimit')
          offset = c.offset
        }
        const total = opts.notes ?? 0
        const count = Math.max(0, Math.min(pageLimit, total - offset))
        const data = Array.from({ length: count }, (_, i) => {
          const id = noteId(token, filter, offset + i)
          return { id, title: id, content: id }
        })
        const end = offset + count
        let pageCursor: string | undefined
        if (end < total) {
          pageCursor = `nc-${++minted}`
          cursors.set(pageCursor, { token, filter, pageLimit, offset: end, expired: false })
        }
        return { data: { data, ...(pageCursor ? { pageCursor } : {}), totalResults: total } }
      }

      // ── link-paginated lists: follow links.next verbatim ────────────────
      let state: LinkState
      if (url.startsWith(HOST)) {
        const u = new URL(url)
        const found = links.get(u.searchParams.get('pageToken') ?? '')
        if (!found) throw new Error(`unknown next link ${url}`)
        if (found.token !== token) throw new Error('next link minted for another user')
        if (u.pathname !== found.path) throw new Error('next link on another path')
        state = found
      } else {
        state = {
          token,
          path: url,
          offset: 0,
          ...(url === '/features' && params['componentId'] !== undefined
            ? { filter: String(params['componentId']) }
            : {}),
        }
      }
      const kind = state.path.slice(1) as LinkKind
      if (!['products', 'components', 'features', 'users'].includes(kind))
        throw new Error(`unexpected path ${state.path}`)
      const total = opts.link?.[kind] ?? 0
      const count = Math.max(0, Math.min(LINK_PAGE, total - state.offset))
      const data = Array.from({ length: count }, (_, i) =>
        linkRow(kind, linkId(kind, token, state.offset + i, state.filter)),
      )
      const end = state.offset + count
      let next: string | null = null
      if (end < total) {
        const t = `lt-${++minted}`
        links.set(t, { ...state, offset: end })
        next = `${HOST}${state.path}?pageToken=${t}`
      }
      return { data: { data, links: { next } } }
    })
    return { get, post: vi.fn() }
  }) as unknown as typeof axios.create)
  return {
    requests,
    expireCursors: () => {
      for (const c of cursors.values()) c.expired = true
    },
    /** Answer every later-page /notes request with this HTTP status. */
    failCursorsWith: (status: number) => {
      failCursorStatus = status
    },
  }
}

type Lister = (
  adapter: ProductboardAdapter,
  creds: Credentials,
  params: QueryParams,
) => Promise<{ id: string }[]>

interface Case {
  name: string
  /** Build the fake for `n` rows in this list. */
  fake: (n: number, requests?: Req[]) => ReturnType<typeof fakeProductboard>
  list: Lister
  /** The ids a token sees, rows [from, from + n). */
  ids: (token: string, from: number, n: number) => string[]
}

function linkCase(name: string, kind: LinkKind, list: Lister, filter?: string): Case {
  return {
    name,
    fake: (n, requests) => fakeProductboard({ link: { [kind]: n } }, requests),
    list,
    ids: (token, from, n) =>
      Array.from({ length: n }, (_, i) => linkId(kind, token, from + i, filter)),
  }
}

/** Products in the listProjects cases; the rest are components. */
const PRODUCTS = 107

const CASES: Case[] = [
  linkCase('listTasks', 'features', (a, c, p) => a.listTasks(c, 'comp-1', p), 'comp-1'),
  linkCase('listUsers', 'users', (a, c, p) => a.listUsers(c, 'ws', p)),
  {
    name: 'listComments',
    fake: (n, requests) => fakeProductboard({ notes: n }, requests),
    list: (a, c, p) => a.listComments(c, 'feat-1', p),
    ids: (token, from, n) => Array.from({ length: n }, (_, i) => noteId(token, 'feat-1', from + i)),
  },
  {
    // Products then components, as one stream. 107 products puts the switch
    // off an upstream page boundary, so a caller page straddles the two.
    name: 'listProjects',
    fake: (n, requests) =>
      fakeProductboard(
        { link: { products: Math.min(n, PRODUCTS), components: Math.max(0, n - PRODUCTS) } },
        requests,
      ),
    list: (a, c, p) => a.listProjects(c, p),
    ids: (token, from, n) =>
      Array.from({ length: from + n }, (_, i) =>
        i < PRODUCTS ? linkId('products', token, i) : linkId('components', token, i - PRODUCTS),
      ).slice(from),
  },
]

beforeEach(() => _resetRowPager())
afterEach(() => vi.clearAllMocks())

describe.each(CASES)('productboard $name pages every row once', (c) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 120
    const N = 2 * L + 1
    c.fake(N)
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await c.list(adapter, C1, params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(c.ids('tok', 0, N))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    c.fake(230)
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await c.list(adapter, C1, params), params, 'productboard')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(c.ids('tok', 0, 230))
  })

  it('a limit above the router maximum is clamped to 500', async () => {
    c.fake(700)
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    const params = parseListQuery({ limit: '1000' })
    expect(params.limit).toBe(500)
    const rows = await c.list(adapter, C1, params)
    expect(rows.map((r) => r.id)).toEqual(c.ids('tok', 0, 500))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('two connections interleaved within the TTL each walk their own rows', async () => {
    const L = 120
    c.fake(2 * L + 1)
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    const a1 = await c.list(adapter, C1, withPageSink({ page: 1, limit: L }))
    const b2 = await c.list(adapter, C2, withPageSink({ page: 2, limit: L }))
    const a2 = await c.list(adapter, C1, withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(c.ids('tok', 0, L))
    expect(b2.map((r) => r.id)).toEqual(c.ids('tok2', L, L))
    expect(a2.map((r) => r.id)).toEqual(c.ids('tok', L, L))
  })
})

describe('productboard link-paginated lists follow links.next', () => {
  it('the page-2 request is the links.next URL, and no undocumented pageLimit is sent', async () => {
    const { requests } = fakeProductboard({ link: { features: 350 } })
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    await adapter.listTasks(C1, 'comp-1', withPageSink({ page: 1, limit: 100 }))
    await adapter.listTasks(C1, 'comp-1', withPageSink({ page: 2, limit: 100 }))
    const urls = requests.map((r) => r.url)
    expect(urls[0]).toBe('/features')
    expect(urls[1]).toMatch(/^https:\/\/api\.productboard\.com\/features\?pageToken=lt-\d+$/)
    expect(urls.slice(1).every((u) => u.startsWith(`${HOST}/features?pageToken=`))).toBe(true)
    expect(requests.every((r) => r.params['pageLimit'] === undefined)).toBe(true)
  })

  it('an exact multiple of 100 stops at the last page', async () => {
    const { requests } = fakeProductboard({ link: { users: 200 } })
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    const params = withPageSink({ page: 2, limit: 100 })
    const rows = await adapter.listUsers(C1, 'ws', params)
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 100 }, (_, i) => linkId('users', 'tok', 100 + i)),
    )
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests).toHaveLength(2)
  })

  it('refuses a links.next that points off the API host', async () => {
    vi.mocked(axios.create).mockImplementation((() => ({
      get: vi.fn(async () => ({
        data: {
          data: [{ id: 'u1', name: 'u1' }],
          links: { next: 'https://evil.example/users?x=1' },
        },
      })),
      post: vi.fn(),
    })) as unknown as typeof axios.create)
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    await expect(adapter.listUsers(C1, 'ws', withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(
      /off the API host/,
    )
  })

  it('listProjects walks products to their end before components', async () => {
    const { requests } = fakeProductboard({ link: { products: 150, components: 150 } })
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    const rows = await adapter.listProjects(C1, withPageSink({ page: 1, limit: 300 }))
    expect(rows.map((r) => r.id)).toEqual([
      ...Array.from({ length: 150 }, (_, i) => linkId('products', 'tok', i)),
      ...Array.from({ length: 150 }, (_, i) => linkId('components', 'tok', i)),
    ])
    expect(requests.map((r) => r.url.replace(/\?.*$/, ''))).toEqual([
      '/products',
      `${HOST}/products`,
      '/components',
      `${HOST}/components`,
    ])
    expect(rows.map((r) => r.metadata?.['entityType'])).toEqual([
      ...Array<string>(150).fill('product'),
      ...Array<string>(150).fill('component'),
    ])
  })

  it('listProjects refuses a links.next that names the page it came from', async () => {
    const self = `${HOST}/products?pageToken=same`
    const get = vi.fn(async () => ({
      data: { data: [{ id: 'p1', name: 'p1' }], links: { next: self } },
    }))
    vi.mocked(axios.create).mockImplementation((() => ({
      get,
      post: vi.fn(),
    })) as unknown as typeof axios.create)
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    await expect(adapter.listProjects(C1, withPageSink({ page: 1, limit: 500 }))).rejects.toThrow(
      /would loop/,
    )
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('listTasks keeps each project walk apart: interleaved projects never share rows', async () => {
    const L = 120
    const { requests } = fakeProductboard({ link: { features: 2 * L + 1 } })
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    const ids = (filter: string, from: number) =>
      Array.from({ length: L }, (_, i) => linkId('features', 'tok', from + i, filter))
    const a1 = await adapter.listTasks(C1, 'comp-A', withPageSink({ page: 1, limit: L }))
    const b2 = await adapter.listTasks(C1, 'comp-B', withPageSink({ page: 2, limit: L }))
    const a2 = await adapter.listTasks(C1, 'comp-A', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids('comp-A', 0))
    expect(b2.map((r) => r.id)).toEqual(ids('comp-B', L))
    expect(a2.map((r) => r.id)).toEqual(ids('comp-A', L))
    expect(requests.filter((r) => r.url === '/features').map((r) => r.params)).toEqual([
      { componentId: 'comp-A' },
      { componentId: 'comp-B' },
    ])
  })

  it('a page with no limit uses the default of 100 rows', async () => {
    fakeProductboard({ link: { users: 250 } })
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    const rows = await adapter.listUsers(C1, 'ws', withPageSink({ page: 2 }))
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 100 }, (_, i) => linkId('users', 'tok', 100 + i)),
    )
  })
})

describe('productboard listComments pages /notes by pageCursor', () => {
  it('the page-2 request carries the pageCursor from page 1, with pageLimit and featureId', async () => {
    const { requests } = fakeProductboard({ notes: 250 })
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    await adapter.listComments(C1, 'feat-1', withPageSink({ page: 1, limit: 100 }))
    await adapter.listComments(C1, 'feat-1', withPageSink({ page: 2, limit: 100 }))
    expect(requests[0]!.params).toEqual({ featureId: 'feat-1', pageLimit: 100 })
    const withCursor = requests.filter((r) => r.params['pageCursor'] !== undefined)
    expect(withCursor.length).toBeGreaterThan(0)
    expect(withCursor[0]!.params).toEqual({
      featureId: 'feat-1',
      pageLimit: 100,
      pageCursor: 'nc-1',
    })
  })

  it('a limit above the documented pageLimit maximum sends 2000 and still serves the caller page', async () => {
    const { requests } = fakeProductboard({ notes: 4500 })
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    const params = withPageSink({ page: 1, limit: 3000 })
    const rows = await adapter.listComments(C1, 'feat-1', params)
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 3000 }, (_, i) => noteId('tok', 'feat-1', i)),
    )
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(requests.every((r) => r.params['pageLimit'] === 2000)).toBe(true)
  })

  it('an expired pageCursor (422) restarts the walk from the first page', async () => {
    const fake = fakeProductboard({ notes: 350 })
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    await adapter.listComments(C1, 'feat-1', withPageSink({ page: 1, limit: 100 }))
    fake.expireCursors()
    const rows = await adapter.listComments(C1, 'feat-1', withPageSink({ page: 3, limit: 100 }))
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 100 }, (_, i) => noteId('tok', 'feat-1', 200 + i)),
    )
  })

  it('a later-page error other than 422 propagates and does not restart the walk', async () => {
    const fake = fakeProductboard({ notes: 350 })
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    await adapter.listComments(C1, 'feat-1', withPageSink({ page: 1, limit: 100 }))
    const before = fake.requests.length
    fake.failCursorsWith(401)
    await expect(
      adapter.listComments(C1, 'feat-1', withPageSink({ page: 3, limit: 100 })),
    ).rejects.toMatchObject({ response: { status: 401 } })
    const after = fake.requests.slice(before)
    expect(after).toHaveLength(1)
    expect(after[0]!.params['pageCursor']).toBeDefined()
  })

  it('walks at two limits on one connection and filter stay apart', async () => {
    const { requests } = fakeProductboard({ notes: 350 })
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    await adapter.listComments(C1, 'feat-1', withPageSink({ page: 2, limit: 100 }))
    const before = requests.length
    const rows = await adapter.listComments(C1, 'feat-1', withPageSink({ page: 3, limit: 50 }))
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 50 }, (_, i) => noteId('tok', 'feat-1', 100 + i)),
    )
    const after = requests.slice(before)
    expect(after.every((r) => r.params['pageLimit'] === 50)).toBe(true)
    expect(after[0]!.params['pageCursor']).toBeUndefined()
  })

  it('an explicit cursor fetches that one upstream page', async () => {
    const { requests } = fakeProductboard({ notes: 250 })
    const adapter = new ProductboardAdapter({ clientId: 'id', clientSecret: 's', redirectUri: 'r' })
    await adapter.listComments(C1, 'feat-1', { limit: 100 })
    const rows = await adapter.listComments(C1, 'feat-1', { limit: 100, cursor: 'nc-1' })
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 100 }, (_, i) => noteId('tok', 'feat-1', 100 + i)),
    )
    expect(requests.at(-1)!.params['pageCursor']).toBe('nc-1')
  })
})
