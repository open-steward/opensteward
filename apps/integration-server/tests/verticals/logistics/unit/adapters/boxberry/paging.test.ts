/**
 * Boxberry `listManifests` (GET json.php?method=ParselSendStory) is not
 * paginated. The first-party API docs
 * (https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-send-story)
 * document exactly four parameters — token, method, from, to — and say:
 * "Позволяет получить список созданных актов приема-передачи. Если не
 * указывать диапазоны дат, то будет возвращен последний созданный акт." No
 * page, limit, offset or next signal exists, so the adapter pages whatever one
 * response returns locally. Before this, every caller page returned the same
 * acts: page 2 repeated page 1 and a sync never saw an end.
 *
 * Known completeness gap (rebuild backlog, outside paging scope): without
 * from/to the docs return only the LAST act, and the adapter sends no range.
 * The default fake models that and a test pins it; the multi-row tests opt
 * into a range-shaped response to pin the local slicing over any size.
 *
 * The other list methods (getOrderList, getOrdersInProgress, getPvzList) call
 * method names the docs do not contain, so they get no paging fix here.
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
import { BoxberryAdapter } from '../../../../../../src/verticals/logistics/adapters/boxberry/index'

const CREDS = { accessToken: 'boxberry_test' }
const CALL_BUDGET = 20
const DOCUMENTED = new Set(['token', 'method', 'from', 'to'])

function acts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    track: `AAP${i + 1}`,
    label: `http://api.boxberry.ru/parcel-files/act?upload_id=${i + 1}`,
    date: '2020.05.05 21:00:26',
  }))
}

/**
 * A fake Boxberry that honours ONLY what the docs define for ParselSendStory:
 * token, method and the optional from/to date range. Any other parameter is
 * refused. As documented, a call without from/to returns only the LAST act;
 * `rangeResponse` returns every act in one response instead, the shape the
 * docs give for a from/to range (which the adapter does not send yet).
 */
function fakeBoxberry(total: number, opts: { rangeResponse?: boolean } = {}) {
  const all = acts(total)
  let calls = 0
  const get = vi.fn(async (_path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const params = cfg?.params ?? {}
    if (params.method !== 'ParselSendStory') {
      throw new Error(`unexpected method ${String(params.method)}`)
    }
    const extra = Object.keys(params).filter((k) => !DOCUMENTED.has(k))
    if (extra.length > 0) throw new Error(`undocumented params sent: ${extra.join(',')}`)
    const hasRange = params.from !== undefined || params.to !== undefined
    if (!hasRange && !opts.rangeResponse) return { data: all.slice(-1) }
    return { data: all }
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

function tracks(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `AAP${start + i}`)
}

const list = (p: QueryParams) => new BoxberryAdapter().listManifests(CREDS, p)
const trackOf = (m: { shipmentIds?: string[] }) => m.shipmentIds?.[0]

afterEach(() => vi.restoreAllMocks())

describe('boxberry listManifests paging (unpaginated ParselSendStory, paged locally)', () => {
  it('with 2L+1 rows, pages 1..3 at limit L return every act once, in order, hasMore exact', async () => {
    const L = 4
    fakeBoxberry(2 * L + 1, { rangeResponse: true })
    const seen: (string | undefined)[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'boxberry')
      seen.push(...env.data.map(trackOf))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ pagedLocally: true, totalCount: 2 * L + 1 }),
      )
    }
    expect(seen).toEqual(tracks(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 returns the second slice, not a repeat of page 1, with only documented params', async () => {
    const { get } = fakeBoxberry(10, { rangeResponse: true })
    const page1 = (await list(parseListQuery({ page: '1', limit: '3' }))).map(trackOf)
    const page2 = (await list(parseListQuery({ page: '2', limit: '3' }))).map(trackOf)
    expect(page1).toEqual(tracks(1, 3))
    expect(page2).toEqual(tracks(4, 3))
    // No paging key exists upstream; the page-2 request is the documented bare call.
    const page2Params = get.mock.calls[1]?.[1]?.params as Record<string, unknown>
    expect(Object.keys(page2Params).sort()).toEqual(['method', 'token'])
  })

  it('a limit above the old in-adapter cap of 100 is not clamped below the collection', async () => {
    fakeBoxberry(150, { rangeResponse: true })
    const params = withPageSink({ page: 1, limit: 500 })
    const env = listPage(await list(params), params, 'boxberry')
    expect(env.data.map(trackOf)).toEqual(tracks(1, 150))
    expect(env.meta.hasMore).toBe(false)
  })

  it('pages the WHOLE collection at the sync size: 501 rows at limit 500 end on page 2', async () => {
    fakeBoxberry(501, { rangeResponse: true })
    const p1 = withPageSink({ page: 1, limit: 500 })
    const env1 = listPage(await list(p1), p1, 'boxberry')
    expect(env1.data).toHaveLength(500)
    expect(env1.meta.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 500 })
    const env2 = listPage(await list(p2), p2, 'boxberry')
    expect(env2.data.map(trackOf)).toEqual(['AAP501'])
    expect(env2.meta.hasMore).toBe(false)
  })

  it('a page past the end is empty', async () => {
    fakeBoxberry(5, { rangeResponse: true })
    expect(await list(parseListQuery({ page: '3', limit: '5' }))).toEqual([])
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeBoxberry(7, { rangeResponse: true })
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'boxberry')
    expect(env.data.map(trackOf)).toEqual(tracks(4, 3))
    expect(env.meta.hasMore).toBe(true)
  })

  it('documented default: no from/to is sent, so only the last act comes back (known gap)', async () => {
    const { get } = fakeBoxberry(10)
    const p1 = withPageSink({ page: 1, limit: 5 })
    const env1 = listPage(await list(p1), p1, 'boxberry')
    expect(env1.data.map(trackOf)).toEqual(['AAP10'])
    expect(env1.meta.hasMore).toBe(false)
    expect(readUpstreamPage(p1)).toEqual(
      expect.objectContaining({ pagedLocally: true, totalCount: 1 }),
    )
    const sent = get.mock.calls[0]?.[1]?.params as Record<string, unknown>
    expect(sent.from).toBeUndefined()
    expect(sent.to).toBeUndefined()
    expect(await list(parseListQuery({ page: '2', limit: '5' }))).toEqual([])
  })
})
