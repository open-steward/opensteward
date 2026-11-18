/**
 * nutcache list paging: `?page=N&limit=M`, next page signalled by a
 * `navigation-next` link.
 *
 * https://nutcache.github.io/apidocs/ ("Pagination"):
 *
 *   "API responses that return a list of objects, such as Projects, Customers
 *   or Time Entries are paginated. To scroll through the pages, add the
 *   parameter page to the query string. The page number starts with 1. By
 *   default, the number of objects returned per page is 10 and is limited to
 *   100."
 *
 * and every list example carries a `links` array whose
 * `{ "href": "projects?limit=10&page=2", "rel": "navigation-next" }` entry
 * points at the next page, with the rows under the resource's own key
 * (`projects`, `organizations`, `project_members`).
 *
 * Before the fix the adapter sent `page` only from a `cursor` param the router
 * never sets, so page 2 repeated page 1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { NutcacheAdapter } from '../../../../../../src/verticals/projects/adapters/nutcache/index'

const CREDS: Credentials = { accessToken: 'nut_test', extra: { orgGuid: 'ORG-GUID' } }
const PROJECT_ID = '6640'

type Resource = 'projects' | 'organizations' | 'project_members'

const PATHS: Record<Resource, string> = {
  projects: '/projects',
  organizations: '/organizations',
  project_members: `/projects/${PROJECT_ID}/project_members`,
}

/**
 * A fake Nutcache honouring only the documented parameters: `page` (1-based,
 * default 1) and `limit` (default 10, at most 100). Anything else is refused.
 */
function fakeNutcache(resource: Resource, total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: 1000 + i, name: `row ${i}` }))
  const get = vi.fn(async (p: string, cfg?: { params?: Record<string, unknown> }) => {
    if (p !== PATHS[resource]) throw new Error(`unexpected path ${p}`)
    const params = cfg?.params ?? {}
    const extra = Object.keys(params).filter((k) => k !== 'page' && k !== 'limit')
    if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
    const page = params['page'] === undefined ? 1 : Number(params['page'])
    const limit = Math.min(params['limit'] === undefined ? 10 : Number(params['limit']), 100)
    const slice = rows.slice((page - 1) * limit, page * limit)
    const links: { href: string; rel: string; type: string }[] = []
    if (page > 1) {
      links.push({
        href: `${resource}?limit=${limit}&page=${page - 1}`,
        rel: 'navigation-prev',
        type: 'GET',
      })
    }
    if (page * limit < total) {
      links.push({
        href: `${resource}?limit=${limit}&page=${page + 1}`,
        rel: 'navigation-next',
        type: 'GET',
      })
    }
    return { data: { links, [resource]: slice } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get, ids: rows.map((r) => String(r.id)) }
}

const adapter = () => new NutcacheAdapter()

async function list(resource: Resource, params: QueryParams): Promise<{ id: string }[]> {
  const a = adapter()
  switch (resource) {
    case 'projects':
      return a.listProjects(CREDS, params)
    case 'organizations':
      return a.listWorkspaces(CREDS, params)
    case 'project_members':
      return a.listUsers(CREDS, PROJECT_ID, params)
  }
}

afterEach(() => vi.restoreAllMocks())

describe.each<[string, Resource]>([
  ['listProjects', 'projects'],
  ['listWorkspaces', 'organizations'],
  ['listUsers', 'project_members'],
])('nutcache %s paging', (_name, resource) => {
  it('walks N = 2L+1 rows over pages 1..3 once each, in order, with exact hasMore', async () => {
    const L = 4
    const { ids } = fakeNutcache(resource, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await list(resource, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(hasMore).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented page and limit', async () => {
    const { get } = fakeNutcache(resource, 20)
    const params = withPageSink({ page: 2, limit: 7 })
    await list(resource, params)
    expect(get).toHaveBeenCalledWith(PATHS[resource], { params: { page: 2, limit: 7 } })
    // An unclamped limit is the caller's own page size: nothing to report.
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('with no limit, page 1 is requested at the adapter default of 50 (within the cap of 100)', async () => {
    const { get } = fakeNutcache(resource, 20)
    await list(resource, withPageSink({}))
    expect(get).toHaveBeenCalledWith(PATHS[resource], { params: { page: 1, limit: 50 } })
  })

  it('a limit above 100 is clamped to 100 and reported as the page size', async () => {
    const { get, ids } = fakeNutcache(resource, 250)
    const params = withPageSink({ page: 2, limit: 500 })
    const got = (await list(resource, params)).map((r) => r.id)
    expect(get).toHaveBeenCalledWith(PATHS[resource], { params: { page: 2, limit: 100 } })
    expect(got).toEqual(ids.slice(100, 200))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 100 })
  })

  it('API path: parseListQuery + listPage serve page 2 and an exact end', async () => {
    const { ids } = fakeNutcache(resource, 5)
    const p1 = withPageSink(parseListQuery({ page: '1', limit: '3' }, adapter()))
    const env1 = listPage(await list(resource, p1), p1, 'nutcache')
    expect(env1.data.map((r) => r.id)).toEqual(ids.slice(0, 3))
    expect(env1.meta).toMatchObject({ page: 1, hasMore: true })

    const p2 = withPageSink(parseListQuery({ page: '2', limit: '3' }, adapter()))
    const env2 = listPage(await list(resource, p2), p2, 'nutcache')
    expect(env2.data.map((r) => r.id)).toEqual(ids.slice(3))
    expect(env2.meta).toMatchObject({ page: 2, hasMore: false })
  })
})

describe('nutcache bare-array response', () => {
  it('is taken as one page with no next link, so hasMore is false', async () => {
    const rows = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]
    vi.spyOn(axios, 'create').mockReturnValue({
      get: vi.fn(async () => ({ data: rows })),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as never)
    const params = withPageSink({ page: 1, limit: 10 })
    const got = await adapter().listProjects(CREDS, params)
    expect(got.map((r) => r.id)).toEqual(['1', '2'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
