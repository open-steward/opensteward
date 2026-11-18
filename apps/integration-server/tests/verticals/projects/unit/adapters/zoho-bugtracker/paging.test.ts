/**
 * Zoho BugTracker paging, per the first-party REST docs:
 *
 * - Portals (https://www.zoho.com/projects/help/rest-api/bugtracker-portal-api.html):
 *   `GET /restapi/portals/` "Gets all the portals for the logged-in user."
 *   It takes no request parameters, so the adapter pages it locally.
 * - Users (https://www.zoho.com/projects/help/rest-api/bugtracker-users-api.html):
 *   `GET /restapi/portal/[PORTALID]/users/` "Gets the details of all users in
 *   a specific portal." Its only request parameter is `user_type`, so the
 *   adapter pages it locally.
 * - Tags (https://www.zoho.com/projects/help/rest-api/bugtracker-tags-api.html):
 *   `GET /api/v3/portal/[PORTALID]/tags` takes "index int Index number of the
 *   tag. 0" and "range int Range of the tags. 100". `index` is the 0-based row
 *   offset; the response has no total, so a full page means maybe more.
 *
 * Every list used to read its index only from `params.cursor`, so caller page
 * 2 repeated page 1. The fakes honour ONLY the documented inputs.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { ZohoBugtrackerAdapter } from '../../../../../../src/verticals/projects/adapters/zoho-bugtracker/index'

vi.mock('axios')

const C1: Credentials = { accessToken: 'tok-1' }
const C2: Credentials = { accessToken: 'tok-2' }
const PORTAL = '2063927'
const TAGS_URL = `https://projectsapi.zoho.com/api/v3/portal/${PORTAL}/tags`

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

type Kind = 'portals' | 'users' | 'tags'

function idOf(token: string, n: number): string {
  return String((token === 'tok-2' ? 900_000 : 100_000) + n)
}

function row(kind: Kind, token: string, n: number): Record<string, unknown> {
  const id = idOf(token, n)
  switch (kind) {
    case 'portals':
      return { id: Number(id), id_string: id, name: `portal ${id}` }
    case 'users':
      return { id, name: `user ${id}`, email: `u${id}@example.com`, role: 'employee' }
    case 'tags':
      return { id, name: `tag ${id}`, color_class: 'bg7f78e0' }
  }
}

function fakeZoho(kind: Kind, total: number, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace('Zoho-oauthtoken ', '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      const all = Array.from({ length: total }, (_, i) => row(kind, token, i))
      if (kind === 'portals') {
        if (path !== '/portals/') throw new Error(`unexpected ${path}`)
        return { data: { login_id: 1, portals: all } }
      }
      if (kind === 'users') {
        if (path !== `/portal/${PORTAL}/users/`) throw new Error(`unexpected ${path}`)
        return { data: { users: all } }
      }
      if (path !== TAGS_URL) throw new Error(`unexpected ${path}`)
      const range = Number(params['range'] ?? 100)
      const index = Number(params['index'] ?? 0)
      if (!Number.isInteger(range) || range < 1) throw new Error(`range ${String(params['range'])}`)
      if (!Number.isInteger(index) || index < 0) throw new Error(`index ${String(params['index'])}`)
      return { data: { tags: all.slice(index, index + range) } }
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: ZohoBugtrackerAdapter,
  c: Credentials,
  p: QueryParams,
) => Promise<{ id: string }[]>

const LISTS: Array<[string, Kind, Lister]> = [
  ['listWorkspaces', 'portals', (a, c, p) => a.listWorkspaces(c, p)],
  ['listUsers', 'users', (a, c, p) => a.listUsers(c, PORTAL, p)],
  ['listTags', 'tags', (a, c, p) => a.listTags(c, PORTAL, p)],
]

function ids(token: string, from: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => idOf(token, from + i))
}

function adapter(): ZohoBugtrackerAdapter {
  return new ZohoBugtrackerAdapter({
    clientId: 'c',
    clientSecret: 's',
    redirectUri: 'https://x.test/cb',
  })
}

afterEach(() => vi.clearAllMocks())

describe('zoho-bugtracker declares no page maximum', () => {
  it('maxPageSize is unset: the tags range has no documented maximum', () => {
    const caps = (adapter() as unknown as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})

describe.each(LISTS)('zoho-bugtracker %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 4
    fakeZoho(kind, 2 * L + 1)
    const a = adapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      served.push(...(await list(a, C1, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids('tok-1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeZoho(kind, 23)
    const a = adapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '5', page: String(page) })
      const env = listPage(await list(a, C1, params), params, 'zoho-bugtracker')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids('tok-1', 0, 23))
  })

  it('two connections interleaved each walk their own rows', async () => {
    const L = 3
    fakeZoho(kind, 2 * L + 1)
    const a = adapter()
    const a1 = await list(a, C1, withPageSink({ page: 1, limit: L }))
    const b2 = await list(a, C2, withPageSink({ page: 2, limit: L }))
    const a2 = await list(a, C1, withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids('tok-1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids('tok-2', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids('tok-1', L, L))
  })
})

describe.each([
  ['listWorkspaces', 'portals' as Kind, LISTS[0]![2]],
  ['listUsers', 'users' as Kind, LISTS[1]![2]],
])('zoho-bugtracker %s pages the whole list locally', (_name, kind, list) => {
  it('sends no index or range and reports the total', async () => {
    const { requests } = fakeZoho(kind, 7)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await list(adapter(), C1, params)
    expect(rows.map((r) => r.id)).toEqual(ids('tok-1', 3, 3))
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 7,
      hasMore: true,
      pagedLocally: true,
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.params['index']).toBeUndefined()
    expect(requests[0]!.params['range']).toBeUndefined()
  })
})

describe('zoho-bugtracker listTags sends the documented index and range', () => {
  it('page 2 is fetched with index = L and range = L', async () => {
    const L = 4
    const { requests } = fakeZoho('tags', 2 * L + 1)
    await adapter().listTags(C1, PORTAL, withPageSink({ page: 2, limit: L }))
    expect(requests.map((r) => [r.params['range'], r.params['index']])).toEqual([[L, L]])
    for (const r of requests) expect(r.params['cursor']).toBeUndefined()
  })

  it('page 1 starts at index 0, the documented first index', async () => {
    const { requests } = fakeZoho('tags', 5)
    const rows = await adapter().listTags(C1, PORTAL, withPageSink({ page: 1, limit: 2 }))
    expect(requests[0]!.params['index']).toBe(0)
    expect(rows.map((r) => r.id)).toEqual(ids('tok-1', 0, 2))
  })

  it('a short page is the end, a full page may have more', async () => {
    fakeZoho('tags', 6)
    const full = withPageSink({ page: 2, limit: 3 })
    await adapter().listTags(C1, PORTAL, full)
    expect(readUpstreamPage(full)?.hasMore).toBe(true)
    const empty = withPageSink({ page: 3, limit: 3 })
    expect(await adapter().listTags(C1, PORTAL, empty)).toEqual([])
    expect(readUpstreamPage(empty)?.hasMore).toBe(false)
  })

  it('a short, non-empty page is the end', async () => {
    fakeZoho('tags', 7)
    const short = withPageSink({ page: 2, limit: 4 })
    const rows = await adapter().listTags(C1, PORTAL, short)
    expect(rows.map((r) => r.id)).toEqual(ids('tok-1', 4, 3))
    expect(readUpstreamPage(short)?.hasMore).toBe(false)
  })

  // No documented maximum for the tags range, so the adapter must not clamp it:
  // a hidden clamp would make a full page read as short and end the walk early.
  it('a limit above 100 is sent as the range unclamped, and the stride follows it', async () => {
    const L = 150
    const { requests } = fakeZoho('tags', 2 * L + 1)
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter().listTags(C1, PORTAL, params)
    expect(requests.map((r) => [r.params['range'], r.params['index']])).toEqual([[L, L]])
    expect(rows.map((r) => r.id)).toEqual(ids('tok-1', L, L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})
