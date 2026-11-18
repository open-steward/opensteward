/**
 * Favro pages every list at a fixed 100 entities, and the next page is named
 * by `requestId` ("The requestId returned by the original request to the
 * paged endpoint.") plus a 0-based `page` index, with
 * `X-Favro-Backend-Identifier` echoed so the request reaches the server
 * process that holds the cached result (https://favro.com/developer/,
 * "Routing" and "Pagination"). There is no documented page-size parameter.
 *
 * Every list used to send `limit` and nothing else, so caller page 2 repeated
 * page 1. The adapter now walks the requestId/page chain through `pageByRows`
 * and cuts exactly the caller's rows out of Favro's 100-row pages.
 *
 * The fake is a strict model of one Favro organization:
 * - it honours ONLY `requestId` + `page` (and ignores `limit`);
 * - the rows depend on the caller's token and on the parent filter
 *   (`collectionId` / `widgetCommonId` / `cardCommonId`); an unfiltered
 *   cards/comments request returns the whole organization's rows;
 * - every requestId belongs to one chain (token, filter, backend). A page
 *   request with a requestId it never minted, another user's requestId, a
 *   conflicting filter, the wrong backend header, or a page index past
 *   `pages - 1` is refused;
 * - later pages answer with a DIFFERENT requestId than the original, so only
 *   an adapter that keeps the original one (as documented) can walk on.
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
import { FavroAdapter } from '../../../../../../src/verticals/projects/adapters/favro/index'

vi.mock('axios')

const ORG = { email: 'me@example.com', organizationId: 'org-1' }
const C1: Credentials = { accessToken: 'tok', extra: ORG }
/** A second connection to the same organization, with another user's token. */
const C2: Credentials = { accessToken: 'tok2', extra: { ...ORG, email: 'you@example.com' } }

/** Favro's fixed page size ("limit ... This should always be 100"). */
const FAVRO_PAGE = 100

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
  headers: Record<string, unknown>
}

type Kind = 'widgets' | 'cards' | 'comments' | 'tags' | 'organizations' | 'users'

/** The query parameter each list filters by, if any. */
const FILTER: Partial<Record<Kind, string>> = {
  widgets: 'collectionId',
  cards: 'widgetCommonId',
  comments: 'cardCommonId',
}

/** The rows a token sees for one filter value ('all' when unfiltered). */
function scope(token: string, filter: string | undefined): string {
  return `${token}.${filter ?? 'all'}`
}

function entity(kind: Kind, sc: string, n: number): Record<string, unknown> {
  const id = `${kind}-${sc}-${String(n).padStart(4, '0')}`
  switch (kind) {
    case 'widgets':
      return { widgetCommonId: id, organizationId: 'org-1', name: id }
    case 'cards':
      return {
        cardId: `cid-${id}`,
        cardCommonId: id,
        organizationId: 'org-1',
        widgetCommonId: 'w1',
        name: id,
      }
    case 'comments':
      return {
        commentId: id,
        cardCommonId: 'c1',
        organizationId: 'org-1',
        userId: 'u1',
        comment: id,
      }
    case 'tags':
      return { tagId: id, organizationId: 'org-1', name: id }
    case 'organizations':
      return { organizationId: id, name: id }
    case 'users':
      return { userId: id, name: id, email: `${id}@example.com` }
  }
}

interface Chain {
  token: string
  filter: string | undefined
  backend: string
  pages: number
}

/** A Favro list endpoint holding `total` entities per (token, filter), paged at 100. */
function fakeFavro(kind: Kind, total: number, requests: Req[] = []) {
  const chains = new Map<string, Chain>()
  let minted = 0
  const filterName = FILTER[kind]
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const basic = String(config?.headers?.['Authorization'] ?? '').replace(/^Basic /, '')
    const token = Buffer.from(basic, 'base64').toString('utf8').split(':')[1] ?? ''
    const get = vi.fn(
      async (
        path: string,
        cfg?: { params?: Record<string, unknown>; headers?: Record<string, unknown> },
      ) => {
        const params = { ...(cfg?.params ?? {}) }
        const reqHeaders = { ...(cfg?.headers ?? {}) }
        requests.push({ token, path, params, headers: reqHeaders })
        if (path !== `/${kind}`) throw new Error(`unexpected path ${path}`)
        const sentFilter =
          filterName && params[filterName] !== undefined ? String(params[filterName]) : undefined
        const pages = Math.max(1, Math.ceil(total / FAVRO_PAGE))
        let requestId: string
        let page = 0
        let chain: Chain
        if (params['page'] !== undefined || params['requestId'] !== undefined) {
          const rid = params['requestId']
          const found = typeof rid === 'string' ? chains.get(rid) : undefined
          if (!found) throw new Error(`page request with an unknown requestId ${String(rid)}`)
          if (found.token !== token) throw new Error('requestId minted for another user')
          if (sentFilter !== undefined && sentFilter !== found.filter)
            throw new Error('requestId minted for another filter')
          if (reqHeaders['X-Favro-Backend-Identifier'] !== found.backend)
            throw new Error('next page without the backend routing header')
          page = Number(params['page'])
          if (!Number.isInteger(page) || page < 1 || page >= pages)
            throw new Error(`page ${String(params['page'])} is outside 1..${pages - 1}`)
          chain = found
          // Adversarial: later pages answer with another requestId. Only the
          // ORIGINAL one names the chain.
          requestId = `${rid as string}-p${page}`
        } else {
          minted++
          requestId = `req-${minted}`
          chain = { token, filter: sentFilter, backend: `be-${minted}`, pages }
          chains.set(requestId, chain)
        }
        const sc = scope(chain.token, chain.filter)
        const start = page * FAVRO_PAGE
        const count = Math.max(0, Math.min(FAVRO_PAGE, total - start))
        return {
          data: {
            requestId,
            page,
            pages,
            limit: FAVRO_PAGE,
            entities: Array.from({ length: count }, (_, i) => entity(kind, sc, start + i)),
          },
          headers: { 'x-favro-backend-identifier': chain.backend },
        }
      },
    )
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  adapter: FavroAdapter,
  creds: Credentials,
  parent: string,
  params: QueryParams,
) => Promise<{ id: string }[]>

const LISTS: Array<[string, Kind, Lister]> = [
  [
    'listProjects',
    'widgets',
    (a, c, parent, p) => {
      p['collection_id'] = parent
      return a.listProjects(c, p)
    },
  ],
  ['listTasks', 'cards', (a, c, parent, p) => a.listTasks(c, parent, p)],
  ['listComments', 'comments', (a, c, parent, p) => a.listComments(c, parent, p)],
  ['listTags', 'tags', (a, c, _parent, p) => a.listTags(c, 'org-1', p)],
  ['listWorkspaces', 'organizations', (a, c, _parent, p) => a.listWorkspaces(c, p)],
  ['listUsers', 'users', (a, c, _parent, p) => a.listUsers(c, 'org-1', p)],
]

/** The ids `token` sees under `parent` (ignored by unfiltered lists). */
function ids(kind: Kind, token: string, parent: string, from: number, n: number): string[] {
  const sc = scope(token, FILTER[kind] ? parent : undefined)
  return Array.from({ length: n }, (_, i) => `${kind}-${sc}-${String(from + i).padStart(4, '0')}`)
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.clearAllMocks())

describe.each(LISTS)('favro %s pages by requestId + page', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 120
    fakeFavro(kind, 2 * L + 1)
    const adapter = new FavroAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, C1, 'p1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'tok', 'p1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('a walk to an exact multiple of 100 stops at the last page', async () => {
    const { requests } = fakeFavro(kind, 200)
    const adapter = new FavroAdapter()
    const params = withPageSink({ page: 2, limit: 100 })
    const rows = await list(adapter, C1, 'p1', params)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'tok', 'p1', 100, 100))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    // Page 0 and page 1 only; never page 2, which is past `pages - 1`.
    expect(requests.map((r) => r.params['page'])).toEqual([undefined, 1])
  })

  it('the first request carries the filter; the next carries the original requestId, page and backend', async () => {
    const { requests } = fakeFavro(kind, 350)
    const adapter = new FavroAdapter()
    await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: 100 }))
    await list(adapter, C1, 'p1', withPageSink({ page: 3, limit: 100 }))
    const filterName = FILTER[kind]
    if (filterName) expect(requests[0]!.params[filterName]).toBe('p1')
    const paged = requests.filter((r) => r.params['page'] !== undefined)
    expect(paged.length).toBeGreaterThan(1)
    for (const [i, r] of paged.entries()) {
      expect(r.params['requestId']).toBe('req-1')
      expect(r.params['page']).toBe(i + 1)
      expect(r.headers['X-Favro-Backend-Identifier']).toBe('be-1')
    }
    // No undocumented page-size parameter is sent.
    expect(requests.every((r) => r.params['limit'] === undefined)).toBe(true)
  })

  it('a limit above the router maximum is clamped to 500 and served from 100-row pages', async () => {
    const { requests } = fakeFavro(kind, 700)
    const adapter = new FavroAdapter()
    const params = parseListQuery({ limit: '1000' })
    expect(params.limit).toBe(500)
    const rows = await list(adapter, C1, 'p1', params)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'tok', 'p1', 0, 500))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(requests.length).toBe(6) // five pages, plus the peek that proves hasMore
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeFavro(kind, 230)
    const adapter = new FavroAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(adapter, C1, 'p1', params), params, 'favro')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'tok', 'p1', 0, 230))
  })

  it('two connections interleaved within the TTL each walk their own rows', async () => {
    const L = 120
    const { requests } = fakeFavro(kind, 2 * L + 1)
    const adapter = new FavroAdapter()
    const a1 = await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C2, 'p1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok2', 'p1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok', 'p1', L, L))
    // The second connection started its own chain rather than following the first's.
    expect(requests.some((r) => r.token === 'tok2' && r.params['requestId'] === undefined)).toBe(
      true,
    )
  })

  it.runIf(FILTER[kind] !== undefined)(
    'two parents interleaved within the TTL each walk their own rows',
    async () => {
      const L = 120
      const { requests } = fakeFavro(kind, 2 * L + 1)
      const adapter = new FavroAdapter()
      const a1 = await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: L }))
      const b2 = await list(adapter, C1, 'p2', withPageSink({ page: 2, limit: L }))
      const a2 = await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: L }))
      expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok', 'p1', 0, L))
      expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok', 'p2', L, L))
      expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok', 'p1', L, L))
      const filterName = FILTER[kind]!
      expect(
        requests.some((r) => r.params[filterName] === 'p2' && r.params['requestId'] === undefined),
      ).toBe(true)
    },
  )
})
