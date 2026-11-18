/**
 * Bitso Business list paging contract.
 *
 * All three list endpoints are an id keyset walked with `marker` + `limit`:
 *
 *   GET /v3/fundings/ (https://docs.bitso.com/bitso-payouts-funding/docs/fundings):
 *   "Specifies to return the objects that are older than the object with the
 *   given funding ID (marker=fid). Useful for pagination."
 *
 *   GET /v3/withdrawals/ (https://docs.bitso.com/bitso-payouts-funding/docs/list-your-withdrawals):
 *   "Specifies to return the objects that are older than the object with the
 *   given withdrawal ID (marker=wid). Useful for pagination."
 *
 *   GET /v3/ledger/ (https://docs.bitso.com/bitso-api/docs/list-ledger):
 *   "Specifies to return older or newer objects (depending on the value of the
 *   'sort' parameter) than the object with the given ID."
 *
 * and each documents `limit` as "Specifies the number of objects to return.
 * Maximum is 100." The response is `{ success, payload: [...] }` with no next
 * field, so a payload shorter than `limit` is the end; otherwise the next
 * page's marker is the last row's id.
 *
 * The fake upstream honours `limit`, `marker` and the `status` / `method`
 * filters, rejects a `limit` outside 1..100 (or not a whole number), and
 * rejects an unknown marker.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials, PageMaxBearing, QueryParams } from '@opensteward/shared'
import { BitsoBusinessAdapter } from '../../../../../../src/verticals/payments/adapters/bitso-business/index'

const CREDS: Credentials = {
  accessToken: 'bitso-key',
  extra: { apiSecret: 'secret', baseUrl: 'https://api.bitso.com' },
}
const MAX = 100

type Raw = Record<string, unknown>

interface Call {
  path: string
  params: Record<string, unknown>
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

interface Case {
  method: 'listCharges' | 'listPayouts' | 'listBalanceTransactions'
  path: string
  idKey: 'fid' | 'wid' | 'eid'
}

const CASES: Case[] = [
  { method: 'listCharges', path: '/v3/fundings/', idKey: 'fid' },
  { method: 'listPayouts', path: '/v3/withdrawals/', idKey: 'wid' },
  { method: 'listBalanceTransactions', path: '/v3/ledger/', idKey: 'eid' },
]

const pad = (i: number): string => String(i + 1).padStart(4, '0')

/** `n` rows, newest first — the order Bitso returns them in. */
function build(c: Case, n: number, prefix = 'r'): { rows: Raw[]; ids: string[] } {
  const ids = Array.from({ length: n }, (_, i) => `${prefix}${c.idKey}-${pad(i)}`)
  return { rows: ids.map((id) => ({ [c.idKey]: id })), ids }
}

function makeServer(c: Case, rows: Raw[]) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    if (path !== c.path) throw new Error(`unexpected path in test: ${path}`)
    const limit = params['limit'] === undefined ? 25 : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
      throw badRequest(`limit ${String(params['limit'])}`)
    let start = 0
    const marker = params['marker']
    if (marker !== undefined && marker !== null) {
      const at = rows.findIndex((r) => r[c.idKey] === marker)
      if (at < 0) throw badRequest('bad marker')
      start = at + 1
    }
    // `status` / `method` narrow the rows older than the marker, as a keyset
    // over a filtered collection does.
    const matching = rows
      .slice(start)
      .filter(
        (r) =>
          (params['status'] === undefined || r['status'] === params['status']) &&
          (params['method'] === undefined || r['method'] === params['method']),
      )
    return { data: { success: true, payload: matching.slice(0, limit) } }
  })
  return { get, calls }
}

function mount(server: ReturnType<typeof makeServer>): void {
  vi.spyOn(axios, 'create').mockReturnValue({
    get: server.get,
    defaults: {},
    interceptors: { request: { use: vi.fn() } },
  } as never)
}

function fake(c: Case, rows: Raw[]) {
  const server = makeServer(c, rows)
  mount(server)
  return server
}

async function list(
  adapter: BitsoBusinessAdapter,
  method: Case['method'],
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<string[]> {
  const rows = (await adapter[method](creds, params)) as { id: string }[]
  return rows.map((r) => r.id)
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('Bitso Business list paging', () => {
  it('declares the documented maximum of 100', () => {
    expect(new BitsoBusinessAdapter().capabilities?.maxPageSize).toBe(MAX)
  })

  for (const c of CASES) {
    describe(c.method, () => {
      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of [3, 17]) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const { rows, ids } = build(c, 2 * L + 1)
          fake(c, rows)
          const a = new BitsoBusinessAdapter()
          const seen: string[] = []
          const hasMore: (boolean | undefined)[] = []
          for (const page of [1, 2, 3]) {
            const params = withPageSink({ page, limit: L } as QueryParams)
            seen.push(...(await list(a, c.method, params)))
            hasMore.push(readUpstreamPage(params)?.hasMore)
          }
          expect(seen).toEqual(ids)
          expect(hasMore).toEqual([true, true, false])
        }
      })

      it('reports pageSize only when the limit was clamped', async () => {
        const { rows } = build(c, 10)
        fake(c, rows)
        const params = withPageSink({ page: 1, limit: 3 } as QueryParams)
        await list(new BitsoBusinessAdapter(), c.method, params)
        expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
      })

      it('a fractional limit is floored to a whole number before it is sent', async () => {
        const { rows, ids } = build(c, 10)
        const { calls } = fake(c, rows)
        const params = withPageSink({ page: 1, limit: 3.7 } as QueryParams)
        expect(await list(new BitsoBusinessAdapter(), c.method, params)).toEqual(ids.slice(0, 3))
        expect(calls[0]!.params['limit']).toBe(3)
      })

      it('the pager key includes limit: page 2 at a new limit follows page 1 at that limit', async () => {
        const { rows, ids } = build(c, 20)
        fake(c, rows)
        const a = new BitsoBusinessAdapter()
        await list(a, c.method, withPageSink({ page: 1, limit: 3 } as QueryParams))
        await list(a, c.method, withPageSink({ page: 2, limit: 3 } as QueryParams))
        expect(await list(a, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams))).toEqual(
          ids.slice(5, 10),
        )
      })

      it('the pager key includes filters: a filtered page 2 never reuses an unfiltered cursor', async () => {
        const L = 3
        const { ids } = build(c, 30)
        const rows = ids.map((id, i) => ({
          [c.idKey]: id,
          status: i % 3 === 0 ? 'complete' : 'pending',
        }))
        const complete = ids.filter((_, i) => i % 3 === 0)
        fake(c, rows)
        const a = new BitsoBusinessAdapter()
        await list(a, c.method, withPageSink({ page: 1, limit: L } as QueryParams))
        await list(a, c.method, withPageSink({ page: 2, limit: L } as QueryParams))
        const filtered = withPageSink({ page: 2, limit: L, status: 'complete' } as QueryParams)
        expect(await list(a, c.method, filtered)).toEqual(complete.slice(L, 2 * L))
      })

      it('a full page ending in an empty-string id ends the walk instead of restarting', async () => {
        const { rows } = build(c, 10)
        rows[4] = { [c.idKey]: '' }
        const { calls } = fake(c, rows)
        const params = withPageSink({ page: 1, limit: 5 } as QueryParams)
        await list(new BitsoBusinessAdapter(), c.method, params)
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
        expect(calls).toHaveLength(1)
      })

      it('the page-2 request carries the documented `marker` and `limit`', async () => {
        const L = 7
        const { rows, ids } = build(c, 2 * L + 1)
        const { calls } = fake(c, rows)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        expect(await list(new BitsoBusinessAdapter(), c.method, params)).toEqual(
          ids.slice(L, 2 * L),
        )
        expect(calls[0]!.params['marker']).toBeUndefined()
        expect(calls.every((x) => x.params['limit'] === L)).toBe(true)
        expect(calls.at(-1)!.params['marker']).toBe(ids[L - 1])
        expect(calls.every((x) => !('page' in x.params))).toBe(true)
      })

      it('clamps a limit above 100 and still serves every row', async () => {
        const { rows, ids } = build(c, 2 * MAX + 1)
        const { calls } = fake(c, rows)
        const a = new BitsoBusinessAdapter()
        const seen: string[] = []
        for (let page = 1; ; page++) {
          expect(page).toBeLessThan(10)
          const params = withPageSink({ page, limit: 500 } as QueryParams)
          seen.push(...(await list(a, c.method, params)))
          const meta = readUpstreamPage(params)
          expect(meta?.pageSize).toBe(MAX)
          if (!meta?.hasMore) break
        }
        expect(seen).toEqual(ids)
        for (const x of calls) expect(x.params['limit']).toBeLessThanOrEqual(MAX)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const { rows, ids } = build(c, 25)
        fake(c, rows)
        const a = new BitsoBusinessAdapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
        const r1 = listPage(
          (await a[c.method](CREDS, p1)) as { id: string }[],
          p1,
          'bitso-business',
        )
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a as PageMaxBearing)
        const r3 = listPage(
          (await a[c.method](CREDS, p3)) as { id: string }[],
          p3,
          'bitso-business',
        )
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })

      it('a page past the end is empty and reports no more', async () => {
        const { rows } = build(c, 5)
        fake(c, rows)
        const a = new BitsoBusinessAdapter()
        const params = withPageSink({ page: 4, limit: 5 } as QueryParams)
        expect(await list(a, c.method, params)).toEqual([])
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })
    })
  }

  it('an explicit marker is sent as-is and a short page reports no more', async () => {
    const c = CASES[0]!
    const { rows, ids } = build(c, 15)
    const { calls } = fake(c, rows)
    const params = withPageSink({ limit: 10, cursor: ids[9] } as QueryParams)
    expect(await list(new BitsoBusinessAdapter(), 'listCharges', params)).toEqual(ids.slice(10))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params['marker']).toBe(ids[9])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  for (const c of CASES.slice(0, 2)) {
    it(`${c.method} still forwards status and method upstream on every page`, async () => {
      const { ids } = build(c, 20)
      const rows = ids.map((id) => ({ [c.idKey]: id, status: 'complete', method: 'spei' }))
      const { calls } = fake(c, rows)
      const params = withPageSink({
        page: 2,
        limit: 4,
        status: 'complete',
        method: 'spei',
      } as QueryParams)
      expect(await list(new BitsoBusinessAdapter(), c.method, params)).toEqual(ids.slice(4, 8))
      expect(calls).toHaveLength(2)
      for (const x of calls) {
        expect(x.params['status']).toBe('complete')
        expect(x.params['method']).toBe('spei')
      }
    })
  }

  it('an explicit `marker` (the documented name) is sent as-is and a full page reports more', async () => {
    const c = CASES[0]!
    const { rows, ids } = build(c, 30)
    const { calls } = fake(c, rows)
    const params = withPageSink({ limit: 10, marker: ids[9] } as QueryParams)
    expect(await list(new BitsoBusinessAdapter(), 'listCharges', params)).toEqual(ids.slice(10, 20))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params['marker']).toBe(ids[9])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('the same API key against another base URL never shares a walk', async () => {
    const c = CASES[0]!
    const prod = makeServer(c, build(c, 15, 'P').rows)
    const stage = makeServer(c, build(c, 15, 'S').rows)
    let next = prod
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: next.get,
      defaults: {},
      interceptors: { request: { use: vi.fn() } },
    })) as never)
    const adapter = new BitsoBusinessAdapter()
    await list(adapter, 'listCharges', withPageSink({ page: 1, limit: 5 } as QueryParams), {
      ...CREDS,
      extra: { ...CREDS.extra, baseUrl: 'https://api.bitso.com' },
    })
    next = stage
    expect(
      await list(adapter, 'listCharges', withPageSink({ page: 2, limit: 5 } as QueryParams), {
        ...CREDS,
        extra: { ...CREDS.extra, baseUrl: 'https://api-stage.bitso.com' },
      }),
    ).toEqual(build(c, 15, 'S').ids.slice(5, 10))
  })

  it('a full page whose last row has no id ends the walk instead of looping', async () => {
    const c = CASES[2]!
    const { rows } = build(c, 10)
    rows[4] = {}
    const { calls } = fake(c, rows)
    const a = new BitsoBusinessAdapter()
    const params = withPageSink({ page: 1, limit: 5 } as QueryParams)
    await list(a, c.method, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('two connections never share a walk', async () => {
    const c = CASES[1]!
    const a = makeServer(c, build(c, 15, 'A').rows)
    const b = makeServer(c, build(c, 15, 'B').rows)
    let next = a
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: next.get,
      defaults: {},
      interceptors: { request: { use: vi.fn() } },
    })) as never)
    const adapter = new BitsoBusinessAdapter()
    await list(adapter, 'listPayouts', withPageSink({ page: 1, limit: 5 } as QueryParams), {
      ...CREDS,
      accessToken: 'key-a',
    })
    next = b
    expect(
      await list(adapter, 'listPayouts', withPageSink({ page: 2, limit: 5 } as QueryParams), {
        ...CREDS,
        accessToken: 'key-b',
      }),
    ).toEqual(build(c, 15, 'B').ids.slice(5, 10))
  })
})
