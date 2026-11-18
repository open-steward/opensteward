/**
 * Rapyd list paging contract (customers, payments, refunds, disputes).
 *
 * Each of these lists is an id keyset walk, newest first, with no `has_more`
 * or total in the envelope ({ status, data: [...] }). The documented params:
 *
 *   GET /v1/customers  https://docs.rapyd.net/en/list-customers-364253.html
 *     ending_before: "The ID of the customer created after the last customer you want to retrieve."
 *     limit: "The maximum number of customers to return. Range: 1-100."
 *   GET /v1/payments   https://docs.rapyd.net/en/list-payments.html
 *     created_before: "The ID of the payment created after the last payment you want to retrieve."
 *     (ending_before / starting_after are marked Deprecated, and mixing the two
 *     families is ERROR_LIST_PAYMENTS_PAYOUTS_QUERY_MISMATCH)
 *   GET /v1/refunds    https://docs.rapyd.net/en/list-refunds.html
 *     ending_before: "The ID of the refund created after the last refund you want to retrieve."
 *   GET /v1/disputes   https://docs.rapyd.net/en/list-disputes.html
 *     ending_before: "The ID of the dispute created after the last dispute you want to retrieve."
 *
 * The fake upstream sits at the axios seam the client uses (it builds the
 * query into the path, so the fake parses it back out) and honours ONLY
 * `limit` (1..100, default 10) and the one documented keyset param per path.
 * Anything else is a 400.
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
import { RapydAdapter } from '../../../../../../src/verticals/payments/adapters/rapyd/index'

const CREDS: Credentials = {
  accessToken: 'rak_a',
  extra: { secretKey: 'rsk_a', environment: 'sandbox' },
}
const MAX = 100

type Method = 'listCustomers' | 'listCharges' | 'listRefunds' | 'listDisputes'

interface Case {
  method: Method
  path: string
  keyset: string
}

const CASES: Case[] = [
  { method: 'listCustomers', path: '/customers', keyset: 'ending_before' },
  { method: 'listCharges', path: '/payments', keyset: 'created_before' },
  { method: 'listRefunds', path: '/refunds', keyset: 'ending_before' },
  { method: 'listDisputes', path: '/disputes', keyset: 'ending_before' },
]

interface Call {
  path: string
  params: Record<string, string>
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

/** Ids newest first, the order Rapyd lists them in. */
function build(n: number, prefix = 'r'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(n - i).padStart(4, '0')}`)
}

function makeServer(c: Case, ids: string[]) {
  const calls: Call[] = []
  const get = vi.fn(async (pathWithQuery: string) => {
    const [path, qs = ''] = pathWithQuery.split('?')
    const params = Object.fromEntries(new URLSearchParams(qs))
    calls.push({ path: path!, params })
    if (path !== c.path) throw new Error(`unexpected path in test: ${path}`)
    for (const k of Object.keys(params)) {
      if (k !== 'limit' && k !== c.keyset) throw badRequest(`unknown param ${k}`)
    }
    const limit = params['limit'] === undefined ? 10 : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
      throw badRequest(`limit ${String(params['limit'])}`)
    let start = 0
    const before = params[c.keyset]
    if (before !== undefined) {
      const at = ids.indexOf(before)
      if (at < 0) throw badRequest(`unknown ${c.keyset}`)
      start = at + 1
    }
    return {
      data: {
        status: { status: 'SUCCESS', error_code: '' },
        data: ids.slice(start, start + limit).map((id) => ({ id })),
      },
    }
  })
  return { get, calls }
}

function fake(c: Case, ids: string[]) {
  const server = makeServer(c, ids)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get } as never)
  return server
}

async function list(
  adapter: RapydAdapter,
  method: Method,
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

describe('Rapyd list paging', () => {
  for (const c of CASES) {
    describe(c.method, () => {
      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of [3, 10]) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const ids = build(2 * L + 1)
          fake(c, ids)
          const a = new RapydAdapter()
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

      it(`the page-2 request carries the documented \`${c.keyset}\` = last id of page 1`, async () => {
        const L = 4
        const ids = build(2 * L + 1)
        const { calls } = fake(c, ids)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        expect(await list(new RapydAdapter(), c.method, params)).toEqual(ids.slice(L, 2 * L))
        expect(calls).toHaveLength(2)
        expect(calls[0]!.params).toEqual({ limit: String(L) })
        expect(calls[1]!.params).toEqual({ limit: String(L), [c.keyset]: ids[L - 1] })
      })

      it('clamps a limit above 100 and still serves every row', async () => {
        const ids = build(2 * MAX + 1)
        const { calls } = fake(c, ids)
        const a = new RapydAdapter()
        const seen: string[] = []
        for (let page = 1; ; page++) {
          expect(page).toBeLessThan(10)
          const params = withPageSink({ page, limit: 1000 } as QueryParams)
          seen.push(...(await list(a, c.method, params)))
          const meta = readUpstreamPage(params)
          expect(meta?.pageSize).toBe(MAX)
          if (!meta?.hasMore) break
        }
        expect(seen).toEqual(ids)
        for (const x of calls) expect(Number(x.params['limit'])).toBeLessThanOrEqual(MAX)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const ids = build(25)
        fake(c, ids)
        const a = new RapydAdapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
        const r1 = listPage((await a[c.method](CREDS, p1)) as { id: string }[], p1, 'rapyd')
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a as PageMaxBearing)
        const r3 = listPage((await a[c.method](CREDS, p3)) as { id: string }[], p3, 'rapyd')
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })

      it('a page past the end is empty and reports no more', async () => {
        fake(c, build(5))
        const params = withPageSink({ page: 4, limit: 5 } as QueryParams)
        expect(await list(new RapydAdapter(), c.method, params)).toEqual([])
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })
    })
  }

  it('the pager key includes limit: page 2 at a new limit follows page 1 at that limit', async () => {
    const c = CASES[0]!
    const ids = build(20)
    fake(c, ids)
    const a = new RapydAdapter()
    await list(a, c.method, withPageSink({ page: 1, limit: 3 } as QueryParams))
    await list(a, c.method, withPageSink({ page: 2, limit: 3 } as QueryParams))
    expect(await list(a, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams))).toEqual(
      ids.slice(5, 10),
    )
  })

  it('two connections never share a walk', async () => {
    const c = CASES[2]!
    const a = makeServer(c, build(15, 'A'))
    const b = makeServer(c, build(15, 'B'))
    let next = a
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get: next.get })) as never)
    const adapter = new RapydAdapter()
    await list(adapter, c.method, withPageSink({ page: 1, limit: 5 } as QueryParams))
    next = b
    expect(
      await list(adapter, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams), {
        accessToken: 'rak_b',
        extra: { secretKey: 'rsk_b', environment: 'sandbox' },
      }),
    ).toEqual(build(15, 'B').slice(5, 10))
    expect(b.calls).toHaveLength(2)
  })

  it('a full page whose last row has no id ends the walk instead of repeating page 1', async () => {
    const get = vi.fn(async () => ({ data: { data: [{ id: 'a' }, {}] } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const params = withPageSink({ page: 1, limit: 2 } as QueryParams)
    await list(new RapydAdapter(), 'listRefunds', params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a raw `cursor` from the caller is sent as the keyset param, outside the pager', async () => {
    const c = CASES[1]!
    const ids = build(12)
    const { calls } = fake(c, ids)
    const params = withPageSink({ limit: 5, cursor: ids[4] } as QueryParams)
    expect(await list(new RapydAdapter(), c.method, params)).toEqual(ids.slice(5, 10))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual({ limit: '5', created_before: ids[4] })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a raw `cursor` that lands on a short last page reports no more', async () => {
    const c = CASES[1]!
    const ids = build(12)
    fake(c, ids)
    const params = withPageSink({ limit: 5, cursor: ids[8] } as QueryParams)
    expect(await list(new RapydAdapter(), c.method, params)).toEqual(ids.slice(9))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('two collections of one connection never share a walk', async () => {
    const customers = makeServer(CASES[0]!, build(15, 'C'))
    const refunds = makeServer(CASES[2]!, build(15, 'R'))
    const get = vi.fn(async (p: string) =>
      p.startsWith('/customers') ? customers.get(p) : refunds.get(p),
    )
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const a = new RapydAdapter()
    await list(a, 'listCustomers', withPageSink({ page: 1, limit: 5 } as QueryParams))
    await list(a, 'listCustomers', withPageSink({ page: 2, limit: 5 } as QueryParams))
    expect(
      await list(a, 'listRefunds', withPageSink({ page: 2, limit: 5 } as QueryParams)),
    ).toEqual(build(15, 'R').slice(5, 10))
    expect(refunds.calls).toHaveLength(2)
    expect(refunds.calls[0]!.params).toEqual({ limit: '5' })
  })

  it('sandbox and production under one access key never share a walk', async () => {
    const c = CASES[2]!
    const sandbox = makeServer(c, build(15, 'S'))
    const production = makeServer(c, build(15, 'P'))
    let next = sandbox
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get: next.get })) as never)
    const a = new RapydAdapter()
    await list(a, c.method, withPageSink({ page: 1, limit: 5 } as QueryParams))
    next = production
    expect(
      await list(a, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams), {
        accessToken: 'rak_a',
        extra: { secretKey: 'rsk_a', environment: 'production' },
      }),
    ).toEqual(build(15, 'P').slice(5, 10))
    expect(production.calls).toHaveLength(2)
  })
})
