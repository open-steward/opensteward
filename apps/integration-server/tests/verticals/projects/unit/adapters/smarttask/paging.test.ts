/**
 * SmartTask list paging.
 *
 * listWorkspaces — GET /organization/list documents no paging parameter:
 *   "This endpoint allows you to get all organizations a user is associated with."
 *   (https://dev.smarttask.io/endpoints/organization/fetch-organizations)
 * so the whole list is paged locally.
 *
 * listUsers — POST /organization-user/filter-users/{organization_id} pages by
 *   `page_no` ("Page Number") and `list_size` ("Cannot be greater than 100")
 *   (https://dev.smarttask.io/endpoints/user/search-users). The response is a
 * bare array with no total or next link, so the end is a short page. The
 * adapter asks for fixed pages of 100 and `pageByRows` cuts the caller's rows
 * out of them, peeking at the next page on a boundary so `hasMore` is exact.
 *
 * Before the fix both ignored `page`: users read the page number from
 * `cursor`, which the router never sends, so page 2 repeated page 1.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import { SmarttaskAdapter } from '../../../../../../src/verticals/projects/adapters/smarttask/index'

const CREDS = { accessToken: 'tok' }
const ORG = '42'
const L = 3
const N = 2 * L + 1
const MAX = 100

function fakeSmarttask(opts: { orgs?: number; users?: number } = {}) {
  const orgs = opts.orgs ?? N
  const users = opts.users ?? N
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (path !== '/organization/list') throw new Error(`unexpected GET ${path}`)
    // No paging parameter is documented for this endpoint.
    for (const k of Object.keys(config?.params ?? {})) throw new Error(`undocumented param ${k}`)
    return {
      data: Array.from({ length: orgs }, (_, i) => ({
        organization_id: i + 1,
        name: `Org ${i + 1}`,
      })),
    }
  })
  const post = vi.fn(
    async (path: string, _body: unknown, config?: { params?: Record<string, unknown> }) => {
      if (path !== `/organization-user/filter-users/${ORG}`)
        throw new Error(`unexpected POST ${path}`)
      const params = config?.params ?? {}
      for (const k of Object.keys(params)) {
        if (!['query', 'page_no', 'list_size'].includes(k))
          throw new Error(`undocumented param ${k}`)
      }
      const size = Number(params['list_size'])
      if (!(size >= 1 && size <= MAX)) throw new Error(`list_size ${size} out of range`)
      const pageNo = Number(params['page_no'] ?? 1)
      const start = (pageNo - 1) * size
      const all = Array.from({ length: users }, (_, i) => ({
        user_id: i + 1,
        full_name: `User ${i + 1}`,
        email: `u${i + 1}@example.test`,
        role: 'core',
      }))
      return { data: all.slice(start, start + size) }
    },
  )
  vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { get, post }
}

const adapter = () => new SmarttaskAdapter()

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('smarttask listUsers paging (page_no + list_size ≤ 100)', () => {
  it('walks pages 1..3 at limit L and yields every row once, in order, with exact hasMore', async () => {
    fakeSmarttask()
    const seen: string[] = []
    const expected = [true, true, false]
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const got = (await adapter().listUsers(CREDS, ORG, params)).map((u) => u.id)
      expect(got.length).toBe(k < 3 ? L : 1)
      seen.push(...got)
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: expected[k - 1],
        pagedLocally: true,
      })
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('a later upstream page is requested with the documented page_no key', async () => {
    const { post } = fakeSmarttask({ users: 2 * MAX + 1 })
    const params = withPageSink({ page: 2, limit: MAX })
    const got = (await adapter().listUsers(CREDS, ORG, params)).map((u) => u.id)
    expect(got).toEqual(Array.from({ length: MAX }, (_, i) => String(MAX + i + 1)))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true })
    const sent = post.mock.calls.map(([, , c]) => (c as { params: Record<string, unknown> }).params)
    expect(sent.map((p) => p['page_no'])).toContain(2)
    for (const p of sent) expect(p['list_size']).toBe(MAX)
  })

  it('a limit above the documented maximum never sends list_size > 100 and still serves every row', async () => {
    const { post } = fakeSmarttask({ users: 250 })
    const params = withPageSink({ page: 1, limit: 500 })
    const got = await adapter().listUsers(CREDS, ORG, params)
    expect(got.length).toBe(250)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false })
    for (const [, , c] of post.mock.calls) {
      expect((c as { params: Record<string, unknown> }).params['list_size']).toBeLessThanOrEqual(
        MAX,
      )
    }
  })

  it('a collection that is an exact multiple of 100 ends on the empty page after it', async () => {
    fakeSmarttask({ users: MAX })
    const params = withPageSink({ page: 1, limit: MAX })
    expect((await adapter().listUsers(CREDS, ORG, params)).length).toBe(MAX)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false })
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    fakeSmarttask()
    const p2 = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env2 = listPage(await adapter().listUsers(CREDS, ORG, p2), p2, 'smarttask')
    expect(env2.data.map((u) => u.id)).toEqual(['4', '5', '6'])
    expect(env2.meta).toMatchObject({ page: 2, hasMore: true })

    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env3 = listPage(await adapter().listUsers(CREDS, ORG, p3), p3, 'smarttask')
    expect(env3.data.map((u) => u.id)).toEqual(['7'])
    expect(env3.meta).toMatchObject({ page: 3, hasMore: false })
  })
})

describe('smarttask listUsers default limit and pager-key tenancy', () => {
  it('with no limit, a page is DEFAULT_PAGE_SIZE (50) rows and more is reported', async () => {
    fakeSmarttask({ users: 60 })
    const params = withPageSink({ page: 1 })
    const got = (await adapter().listUsers(CREDS, ORG, params)).map((u) => u.id)
    expect(got).toEqual(Array.from({ length: 50 }, (_, i) => String(i + 1)))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true })
  })

  /**
   * A fake whose rows depend on the bearer token and the organization, so a
   * pager slot shared across connections or organizations serves the wrong
   * tenant's rows. Token 'tok' gives ids 1.., 'tok2' gives 1001..; org 42
   * adds 0 and org 43 adds 5000.
   */
  function fakeTenants() {
    vi.spyOn(axios, 'create').mockImplementation(((cfg?: { headers?: Record<string, string> }) => {
      const auth = cfg?.headers?.['Authorization'] ?? ''
      const tokenBase = auth === 'Bearer tok2' ? 1000 : 0
      const post = vi.fn(
        async (path: string, _body: unknown, config?: { params?: Record<string, unknown> }) => {
          const m = /^\/organization-user\/filter-users\/(\d+)$/.exec(path)
          if (!m) throw new Error(`unexpected POST ${path}`)
          const orgBase = m[1] === '43' ? 5000 : 0
          const size = Number(config?.params?.['list_size'])
          const pageNo = Number(config?.params?.['page_no'] ?? 1)
          const all = Array.from({ length: N }, (_, i) => ({
            user_id: tokenBase + orgBase + i + 1,
            full_name: `User ${i + 1}`,
            email: `u${i + 1}@example.test`,
            role: 'core',
          }))
          return { data: all.slice((pageNo - 1) * size, pageNo * size) }
        },
      )
      return { get: vi.fn(), post }
    }) as never)
  }

  it('two connections never share a walk: page 2 for another token serves its own rows', async () => {
    fakeTenants()
    await adapter().listUsers(CREDS, ORG, withPageSink({ page: 1, limit: L }))
    const p2 = withPageSink({ page: 2, limit: L })
    const got = (await adapter().listUsers({ accessToken: 'tok2' }, ORG, p2)).map((u) => u.id)
    expect(got).toEqual(['1004', '1005', '1006'])
  })

  it('two organizations on one connection never share a walk', async () => {
    fakeTenants()
    await adapter().listUsers(CREDS, '42', withPageSink({ page: 1, limit: L }))
    const p2 = withPageSink({ page: 2, limit: L })
    const got = (await adapter().listUsers(CREDS, '43', p2)).map((u) => u.id)
    expect(got).toEqual(['5004', '5005', '5006'])
  })
})

describe('smarttask listWorkspaces paging (whole list, paged locally)', () => {
  it('walks pages 1..3 at limit L and yields every row once, in order, with exact hasMore', async () => {
    fakeSmarttask()
    const seen: string[] = []
    const expected = [true, true, false]
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const got = (await adapter().listWorkspaces(CREDS, params)).map((w) => w.id)
      expect(got.length).toBe(k < 3 ? L : 1)
      seen.push(...got)
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: expected[k - 1],
        totalCount: N,
        pagedLocally: true,
      })
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('a limit above the collection returns everything and reports the end', async () => {
    fakeSmarttask()
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await adapter().listWorkspaces(CREDS, params)).length).toBe(N)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: N })
  })

  // Regression guard only: getWorkspace reads the whole organization list
  // through allWorkspaces(). The previous listWorkspaces(credentials, {})
  // call also served every row (no limit means no slice), so this pins the
  // lookup rather than proving a behaviour change.
  it('getWorkspace finds an organization at the end of the list', async () => {
    fakeSmarttask()
    expect((await adapter().getWorkspace(CREDS, String(N))).id).toBe(String(N))
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    fakeSmarttask()
    const p = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env = listPage(await adapter().listWorkspaces(CREDS, p), p, 'smarttask')
    expect(env.data.map((w) => w.id)).toEqual([String(N)])
    expect(env.meta).toMatchObject({ page: 3, hasMore: false, totalCount: N })
  })
})
