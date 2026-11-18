/**
 * NimbusPost `listCarriers` (GET https://api.nimbuspost.com/v1/courier) is not
 * paginated. The first-party Partners API docs
 * (https://documenter.getpostman.com/view/9692837/TW6wHnoz#2665632a-c9b6-419b-a696-dc599f3affa1)
 * say: "Use this API endpoint to Get the list of available couriers for your
 * account. No parameters are required." No page, limit or next signal exists,
 * so the adapter pages the one response locally. Before this, every caller
 * page returned the same couriers: page 2 repeated page 1.
 *
 * listOrders (/v1/orders) and listWarehouses (/v1/warehouse) call paths the
 * Partners API does not document (orders and warehouses exist only on the
 * separate ship.nimbuspost.com/api with NP-API-KEY auth, whose docs give no
 * response fields), so they refuse with 501: see refusals.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { NimbusPostAdapter } from '../../../../../../src/verticals/logistics/adapters/nimbuspost/index'

const CREDS = { accessToken: 'nimbuspost_test' }
const CALL_BUDGET = 20

function couriers(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: `Courier ${i + 1}` }))
}

/**
 * A fake NimbusPost Partners API that honours ONLY what the docs define for
 * GET /courier: no parameters. Any query parameter is refused, and every call
 * returns the whole courier list.
 */
function fakeNimbusPost(total: number) {
  const all = couriers(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    if (path !== 'courier') throw new Error(`unexpected path ${path}`)
    const sent = Object.keys(cfg?.params ?? {})
    if (sent.length > 0) throw new Error(`undocumented params sent: ${sent.join(',')}`)
    return { data: { status: true, data: all } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  return { get }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

const list = (p: QueryParams) => new NimbusPostAdapter().listCarriers(CREDS, p)
const idOf = (c: { id?: string }) => c.id

afterEach(() => vi.restoreAllMocks())

describe('nimbuspost listCarriers paging (unpaginated GET /courier, paged locally)', () => {
  it('with 2L+1 rows, pages 1..3 at limit L return every courier once, in order, hasMore exact', async () => {
    const L = 4
    fakeNimbusPost(2 * L + 1)
    const seen: (string | undefined)[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'nimbuspost')
      seen.push(...env.data.map(idOf))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ pagedLocally: true, totalCount: 2 * L + 1 }),
      )
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 returns the second slice, not a repeat of page 1, with no params sent', async () => {
    const { get } = fakeNimbusPost(10)
    const page1 = (await list(parseListQuery({ page: '1', limit: '3' }))).map(idOf)
    const page2 = (await list(parseListQuery({ page: '2', limit: '3' }))).map(idOf)
    expect(page1).toEqual(ids(1, 3))
    expect(page2).toEqual(ids(4, 3))
    // No paging key exists upstream; the page-2 request is the documented bare call.
    expect(get.mock.calls[1]?.[0]).toBe('courier')
    expect(Object.keys(get.mock.calls[1]?.[1]?.params ?? {})).toEqual([])
  })

  it('a large limit is not clamped below the collection: 501 rows at limit 500 end on page 2', async () => {
    fakeNimbusPost(501)
    const p1 = withPageSink({ page: 1, limit: 500 })
    const env1 = listPage(await list(p1), p1, 'nimbuspost')
    expect(env1.data).toHaveLength(500)
    expect(env1.meta.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 500 })
    const env2 = listPage(await list(p2), p2, 'nimbuspost')
    expect(env2.data.map(idOf)).toEqual(['501'])
    expect(env2.meta.hasMore).toBe(false)
  })

  it('a page past the end is empty', async () => {
    fakeNimbusPost(5)
    expect(await list(parseListQuery({ page: '3', limit: '5' }))).toEqual([])
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeNimbusPost(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'nimbuspost')
    expect(env.data.map(idOf)).toEqual(ids(4, 3))
    expect(env.meta.hasMore).toBe(true)
  })
})
