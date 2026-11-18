/**
 * Pochta Rossii `listManifests` (GET /1.0/batch, "Поиск всех партий") pages by
 * page number + size:
 * https://otpravka.pochta.ru/static/views/specification/batches-search_all_batches.html
 *   "size Количество записей на странице (Опционально)"
 *   "page Номер страницs (0..N) (Опционально)"
 * The response is a bare JSON array with no total, so only a short page marks
 * the end; the adapter walks it through pageByRows, which peeks at the next
 * upstream page when a caller page ends on a full one.
 *
 * Before this, the adapter sent only `size`: every caller page got the first
 * page of batches, so page 2 repeated page 1.
 *
 * listShipments and listOrders (a walk of batches, then each batch's records)
 * and the refusing listTrackingEvents / getTrackingEvents are tested in
 * shipments.test.ts.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { PochtaRussiaAdapter } from '../../../../../../src/verticals/logistics/adapters/pochta-russia/index'

const CREDS = { accessToken: 'tok', refreshToken: 'dXNlcjpwYXNz' }
const CALL_BUDGET = 20
/** The adapter's own upstream page ceiling (the specification names none). */
const ADAPTER_MAX = 100

function batches(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    'batch-name': `B-${String(i + 1).padStart(4, '0')}`,
    'batch-status': 'CREATED',
  }))
}

/**
 * A fake Otpravka that honours ONLY the documented parameters of
 * GET /1.0/batch: `size` and 0-based `page` (plus the documented filters
 * mailType, mailCategory, sort). Any other parameter is refused. With no
 * `size` it answers everything, with no `page` it serves page 0.
 */
function fakeOtpravka(total: number) {
  const all = batches(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    if (path !== '/batch') throw new Error(`unexpected path ${path}`)
    const params = cfg?.params ?? {}
    for (const k of Object.keys(params)) {
      if (!['size', 'page', 'mailType', 'mailCategory', 'sort'].includes(k))
        throw new Error(`undocumented param ${k}`)
    }
    const size = params.size === undefined ? all.length : Number(params.size)
    const page = Number(params.page ?? 0)
    return { data: all.slice(page * size, page * size + size) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

function ids(start: number, count: number): string[] {
  return batches(start + count)
    .slice(start, start + count)
    .map((b) => b['batch-name'])
}

const list = (p: QueryParams) => new PochtaRussiaAdapter().listManifests(CREDS, p)

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('pochta-russia listManifests paging (0-based page + size)', () => {
  it('with 2L+1 rows, pages 1..3 at limit L return every batch once, in order, hasMore exact', async () => {
    const L = 4
    const N = 2 * L + 1
    const { get } = fakeOtpravka(N)
    const seen: string[] = []
    const hasMore: boolean[] = []
    const reported: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'pochta-russia')
      seen.push(...env.data.map((m) => m.id!))
      hasMore.push(env.meta.hasMore as boolean)
      reported.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(0, N))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
    // A sequential walk costs one request per upstream page.
    expect(get.mock.calls.map((c) => c[1])).toEqual([
      { params: { size: L, page: 0 } },
      { params: { size: L, page: 1 } },
      { params: { size: L, page: 2 } },
    ])
  })

  it('with exactly 2L rows, the full last page reports no more', async () => {
    const L = 4
    fakeOtpravka(2 * L)
    const hasMore: boolean[] = []
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'pochta-russia')
      expect(env.data.map((m) => m.id)).toEqual(ids((k - 1) * L, L))
      hasMore.push(env.meta.hasMore as boolean)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('the page-2 request carries the documented 0-based page and size', async () => {
    const { get } = fakeOtpravka(20)
    const params = withPageSink({ page: 2, limit: 7 })
    const got = await list(params)
    expect(got.map((m) => m.id)).toEqual(ids(7, 7))
    expect(get.mock.calls.map((c) => c[1])).toContainEqual({ params: { size: 7, page: 1 } })
  })

  it('a limit above the adapter maximum clamps the upstream size, and the caller still gets its full page', async () => {
    const { get } = fakeOtpravka(250)
    const p1 = withPageSink({ page: 1, limit: 150 })
    const env1 = listPage(await list(p1), p1, 'pochta-russia')
    expect(env1.data.map((m) => m.id)).toEqual(ids(0, 150))
    expect(env1.meta.hasMore).toBe(true)

    const p2 = withPageSink({ page: 2, limit: 150 })
    const env2 = listPage(await list(p2), p2, 'pochta-russia')
    expect(env2.data.map((m) => m.id)).toEqual(ids(150, 100))
    expect(env2.meta.hasMore).toBe(false)
    for (const c of get.mock.calls) {
      expect((c[1] as { params: { size: number } }).params.size).toBe(ADAPTER_MAX)
    }
  })

  it('a page past the end is empty and reports no more', async () => {
    fakeOtpravka(5)
    const params = withPageSink({ page: 3, limit: 5 })
    const env = listPage(await list(params), params, 'pochta-russia')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    const { get } = fakeOtpravka(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'pochta-russia')
    expect(env.data.map((m) => m.id)).toEqual(ids(3, 3))
    expect(env.meta.hasMore).toBe(true)
    expect(get.mock.calls.map((c) => c[1])).toContainEqual({ params: { size: 3, page: 1 } })
  })

  it('the walk is per connection: a second user never gets rows the first user fetched', async () => {
    // Two connections on one Otpravka account differ only in the per-user key
    // (refreshToken → X-User-Authorization). Each sees its own batches.
    const CREDS_B = { accessToken: 'tok', refreshToken: 'b3RoZXI6cGFzcw==' }
    const rowsFor = (who: string) =>
      Array.from({ length: 12 }, (_, i) => ({
        'batch-name': `${who}-${i + 1}`,
        'batch-status': 'CREATED',
      }))
    const gets: Record<string, ReturnType<typeof vi.fn>> = {}
    vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers?: Record<string, string> }) => {
      const who =
        cfg.headers?.['X-User-Authorization'] === `Basic ${CREDS_B.refreshToken}` ? 'B' : 'A'
      const all = rowsFor(who)
      const get = vi.fn(
        async (_path: string, c?: { params?: { size?: number; page?: number } }) => {
          const size = Number(c?.params?.size)
          const page = Number(c?.params?.page ?? 0)
          return { data: all.slice(page * size, page * size + size) }
        },
      )
      gets[who] = get
      return { get, post: vi.fn() }
    }) as never)

    // User A's page 1 ends on a full upstream page, so the pager peeks at
    // A's upstream page 1 and keeps it in memory.
    const a1 = await new PochtaRussiaAdapter().listManifests(
      CREDS,
      withPageSink({ page: 1, limit: 4 }),
    )
    expect(a1.map((m) => m.id)).toEqual(['A-1', 'A-2', 'A-3', 'A-4'])

    const b2 = await new PochtaRussiaAdapter().listManifests(
      CREDS_B,
      withPageSink({ page: 2, limit: 4 }),
    )
    expect(b2.map((m) => m.id)).toEqual(['B-5', 'B-6', 'B-7', 'B-8'])
    expect(gets.B!.mock.calls.map((c) => c[1])).toContainEqual({ params: { size: 4, page: 1 } })
  })

  it('walks at two limits on one connection do not share upstream positions', async () => {
    // The upstream page is sized from the caller's limit, so a position
    // recorded at size 4 is a different row at size 7. No reset in between.
    const { get } = fakeOtpravka(30)
    for (let k = 1; k <= 2; k++) {
      const got = await list(withPageSink({ page: k, limit: 4 }))
      expect(got.map((m) => m.id)).toEqual(ids((k - 1) * 4, 4))
    }
    const at7 = await list(withPageSink({ page: 2, limit: 7 }))
    expect(at7.map((m) => m.id)).toEqual(ids(7, 7))
    expect(get.mock.calls.map((c) => c[1])).toContainEqual({ params: { size: 7, page: 1 } })
  })

  it('with no limit, one caller page is one upstream page of the adapter default size', async () => {
    const DEFAULT = 50
    const { get } = fakeOtpravka(120)
    const params = withPageSink({ page: 1 })
    const got = await list(params)
    expect(got.map((m) => m.id)).toEqual(ids(0, DEFAULT))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    // Page 1 ends on a full upstream page, so the pager peeks at the next one.
    expect(get.mock.calls.map((c) => c[1])).toEqual([
      { params: { size: DEFAULT, page: 0 } },
      { params: { size: DEFAULT, page: 1 } },
    ])
  })
})
