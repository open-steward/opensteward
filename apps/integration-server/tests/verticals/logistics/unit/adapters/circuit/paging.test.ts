/**
 * Circuit (Spoke Dispatch) list paging. listWarehouses ignored the caller's
 * `page`, so page 2 repeated page 1 and no depot past the first upstream page
 * could be reached.
 *
 * GET /depots is token-paged. First-party spec,
 * https://developer.dispatch.spoke.com/openapi-v0.2b.json (operationId listDepots):
 *   pageToken:   "The page token to continue from."
 *   maxPageSize: "The maximum number of depots to return." (default 20, minimum 1, maximum 20)
 *   nextPageToken (response, required, string | null): "The next page token."
 *
 * One upstream page holds at most 20 depots, so a caller page is not an
 * upstream page: the adapter pages by rows (pageByRows) over the token chain,
 * always asking for the documented maximum.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import { CircuitAdapter } from '../../../../../../src/verticals/logistics/adapters/circuit/index'

const CREDS = { accessToken: 'circuit_test_key' }
const OTHER = { accessToken: 'circuit_other_key' }
const CALL_BUDGET = 60
const L = 5
const N = 2 * L + 1
const MAX = 20
const DEPOT_KEYS = new Set(['pageToken', 'maxPageSize'])

const token = (offset: number, size: number, key: string) =>
  Buffer.from(JSON.stringify({ k: key, o: offset, s: size })).toString('base64')
const untoken = (t: string, key: string): number => {
  const d = JSON.parse(Buffer.from(t, 'base64').toString()) as { k: string; o: number }
  if (d.k !== key) throw new Error('400: page token minted for another API key')
  return d.o
}

/** The API key from `Authorization: Basic base64(key:)`. */
const keyOf = (auth: string) =>
  Buffer.from(auth.replace(/^Basic /, ''), 'base64')
    .toString()
    .replace(/:$/, '')

const tag = (key: string) => (key === CREDS.accessToken ? '' : `${key}:`)

/**
 * A fake Circuit that honours ONLY the documented query params of GET /depots
 * and pages by its own opaque nextPageToken. Each API key is its own team.
 */
function fakeCircuit(depots: number, perKey: Record<string, number> = {}) {
  let calls = 0
  const log: Array<{ key: string; path: string; params: Record<string, unknown> }> = []
  const gets = new Map<string, ReturnType<typeof makeGet>>()

  function makeGet(key: string) {
    const n = perKey[key] ?? depots
    const rows = Array.from({ length: n }, (_, i) => ({
      id: `depots/${tag(key)}d${i + 1}`,
      name: `Depot ${i + 1}`,
    }))
    return vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const params = Object.fromEntries(
        Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      log.push({ key, path, params })
      if (path !== 'depots') throw new Error(`unexpected path ${path}`)
      const bad = Object.keys(params).filter((k) => !DEPOT_KEYS.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const size = params.maxPageSize === undefined ? 20 : Number(params.maxPageSize)
      if (!(size >= 1 && size <= MAX)) throw new Error(`400: maxPageSize ${size}`)
      const start = params.pageToken === undefined ? 0 : untoken(String(params.pageToken), key)
      const page = rows.slice(start, start + size)
      const more = start + size < rows.length
      return {
        data: { depots: page, nextPageToken: more ? token(start + size, size, key) : null },
      }
    })
  }

  const getFor = (key: string) => {
    let get = gets.get(key)
    if (!get) gets.set(key, (get = makeGet(key)))
    return get
  }

  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers: Record<string, string> }) => ({
    get: getFor(keyOf(cfg.headers.Authorization!)),
    post: vi.fn(),
  })) as never)
  return { get: getFor(CREDS.accessToken), log }
}

const ids = (n: number, prefix = '') =>
  Array.from({ length: n }, (_, i) => `depots/${prefix}d${i + 1}`)
const byId = (r: { id?: string }): string => r.id ?? '<no id>'

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('circuit listWarehouses paging', () => {
  const adapter = () => new CircuitAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeCircuit(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listWarehouses(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
  })

  it('walks past the first upstream page (20 depots) at a sync-sized limit', async () => {
    fakeCircuit(45)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: 30 })
      seen.push(...(await adapter().listWarehouses(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(45))
    expect(more).toEqual([true, false])
  })

  it('the page-2 request carries the documented key', async () => {
    // 20 depots per upstream page: caller page 2 at limit 20 starts on upstream page 2.
    const { get } = fakeCircuit(45)
    await adapter().listWarehouses(CREDS, withPageSink({ page: 1, limit: MAX }))
    await adapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: MAX }))
    const last = get.mock.calls.at(-1)!
    expect(last[0]).toBe('depots')
    expect(typeof (last[1] as { params: Record<string, unknown> }).params.pageToken).toBe('string')
  })

  it('a limit above the maximum is clamped and never sends maxPageSize above 20', async () => {
    const { get } = fakeCircuit(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listWarehouses(CREDS, params)
    expect(rows.map(byId)).toEqual(ids(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    for (const c of get.mock.calls) {
      const sent = Number((c[1] as { params: Record<string, unknown> }).params.maxPageSize)
      expect(sent).toBeLessThanOrEqual(MAX)
    }
  })

  it('every upstream request asks for the documented maximum of 20 depots', async () => {
    const { get } = fakeCircuit(45)
    await adapter().listWarehouses(CREDS, withPageSink({ page: 1, limit: 30 }))
    await adapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: 30 }))
    expect(get.mock.calls.length).toBeGreaterThan(0)
    for (const c of get.mock.calls) {
      expect((c[1] as { params: Record<string, unknown> }).params.maxPageSize).toBe(MAX)
    }
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeCircuit(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listWarehouses(CREDS, params), params, 'circuit')
    expect(env.data.map(byId)).toEqual(ids(N).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('a second connection never reuses the first connection’s rows or tokens', async () => {
    const { log } = fakeCircuit(N, { [OTHER.accessToken]: N })
    await adapter().listWarehouses(CREDS, withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter().listWarehouses(OTHER, params)
    expect(rows.map(byId)).toEqual(ids(N, `${OTHER.accessToken}:`).slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    const mine = log.filter((c) => c.key === OTHER.accessToken)
    expect(mine.length).toBeGreaterThan(0)
    expect(mine[0]!.params.pageToken).toBeUndefined()
  })
})
