/**
 * MiraklAdapter.listRefunds / getRefund over RT11 (GET /api/returns).
 *
 * RT11, per
 * https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3/returns/rt11.md:
 * "This resource supports seek pagination (see documentation)"; the response
 * carries "`data` (array, required) Page of data" and "`next_page_token`
 * (string) Token to access the next page. Absent if the current page is the
 * last one." Documented filters include `return_id` and
 * `return_last_updated_from` ("Filter returns updated after the given date.").
 *
 * Seek pagination, per the "Seek pagination & sort" section of
 * https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3:
 * "Use the optional limit query parameter to indicate the maximum number of
 * items returned per page. The default value is 10. The maximum value is 100.
 * If there are more results to return, the response contains a
 * next_page_token field. Pass this value in the page_token query parameter to
 * return the next page of results." and "When using the page_token parameter
 * all other parameters are ignored".
 *
 * The fake upstream honours only those documented parameters.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { MiraklAdapter } from '../../../../../../src/verticals/ecommerce/adapters/mirakl'
import { RefundSchema } from '../../../../../../src/verticals/ecommerce/schema/refund'

const CREDS: Credentials = {
  accessToken: 'seller-key',
  extra: { baseUrl: 'https://op.mirakl.net' },
}
const MAX = 100
const DOCUMENTED = new Set([
  'limit',
  'page_token',
  'return_id',
  'return_state',
  'return_creation_date_from',
  'return_creation_date_to',
  'return_last_updated_from',
  'return_last_updated_to',
  'order_commercial_id',
  'order_line_id',
  'return_rma',
  'customer_id',
  'shop_id',
])

interface Call {
  path: string
  params: Record<string, unknown>
}

function row(id: string, updated = '2026-01-01T00:00:00Z'): Record<string, unknown> {
  return {
    id,
    order_id: `o-${id}`,
    order_commercial_id: `oc-${id}`,
    date_created: '2025-12-01T10:00:00Z',
    last_updated: updated,
    method_code: 'RETURN_METHOD_BY_MAIL',
    state: 'IN_PROGRESS',
    return_address: {
      city: 'Paris',
      country_iso_code: 'FRA',
      street1: '1 rue',
      zip_code: '75001',
    },
    return_lines: [{ order_line_id: `o-${id}-1`, quantity: 1, reason_code: 'RETURN_OTHER' }],
  }
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `r${i + 1}`)
}

/**
 * An operator instance serving `rows` from RT11. `pageSizes`, when given,
 * makes the upstream return fewer rows than `limit` on the pages it lists
 * (seek pagination promises at most `limit`), so the walk must not assume
 * full pages.
 */
function fakeMirakl(rows: Array<Record<string, unknown>>, pageSizes: number[] = []): Call[] {
  const calls: Call[] = []
  const tokens = new Map<string, { offset: number; limit: number; filtered: typeof rows }>()
  let minted = 0
  const respond = (path: string, params: Record<string, unknown> = {}) => {
    calls.push({ path, params })
    if (path !== '/api/returns') throw new Error(`unexpected path ${path}`)
    for (const k of Object.keys(params)) {
      if (!DOCUMENTED.has(k)) throw new Error(`undocumented RT11 parameter ${k}`)
    }
    let offset = 0
    let limit: number
    let filtered: typeof rows
    const token = params['page_token']
    if (token !== undefined) {
      const pos = tokens.get(String(token))
      if (!pos) throw new Error(`unknown page_token ${String(token)}`)
      ;({ offset, limit, filtered } = pos)
    } else {
      limit = Math.min(Number(params['limit'] ?? 10), MAX)
      if (!Number.isInteger(limit) || limit < 1) throw new Error(`bad limit ${limit}`)
      filtered = rows
      const from = params['return_last_updated_from']
      if (from !== undefined) {
        filtered = filtered.filter(
          (r) => Date.parse(String(r['last_updated'])) > Date.parse(String(from)),
        )
      }
      const rid = params['return_id']
      if (rid !== undefined) {
        const want = Array.isArray(rid) ? rid.map(String) : [String(rid)]
        filtered = filtered.filter((r) => want.includes(String(r['id'])))
      }
    }
    const pageIndex = calls.length - 1
    const take = Math.min(limit, pageSizes[pageIndex] ?? limit)
    const data = filtered.slice(offset, offset + take)
    const body: Record<string, unknown> = { data }
    if (offset + take < filtered.length) {
      const t = `tok-${++minted}`
      tokens.set(t, { offset: offset + take, limit, filtered })
      body['next_page_token'] = t
    }
    return { data: body }
  }
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) =>
      respond(path, c?.params),
    ),
  })) as never)
  return calls
}

async function list(params: QueryParams, creds: Credentials = CREDS) {
  return new MiraklAdapter().listRefunds(creds, params)
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('MiraklAdapter.listRefunds pages RT11 by limit/page_token', () => {
  it('serves 2L + 1 rows once each over three pages with an exact hasMore', async () => {
    const L = 3
    const calls = fakeMirakl(ids(2 * L + 1).map((id) => row(id)))
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const got = await list(params)
      for (const r of got) RefundSchema.parse(r)
      seen.push(...got.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(2 * L + 1))
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.path)).toEqual(['/api/returns', '/api/returns', '/api/returns'])
    expect(calls[0]!.params).toEqual({ limit: L })
    expect(calls[1]!.params).toEqual({ page_token: 'tok-1' })
    expect(calls[2]!.params).toEqual({ page_token: 'tok-2' })
  })

  it('follows the token on an uneven upstream page and still serves every row once', async () => {
    const L = 3
    // Upstream returns 2 rows on the first call although limit=3.
    fakeMirakl(
      ids(2 * L + 1).map((id) => row(id)),
      [2],
    )
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await list(params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('ends exactly on a collection that is a multiple of the page size', async () => {
    fakeMirakl(ids(4).map((id) => row(id)))
    const hasMore: Array<boolean | undefined> = []
    const seen: string[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await list(params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(4))
    expect(hasMore).toEqual([true, false])
  })

  it(`clamps a limit above ${MAX} and reports the size sent`, async () => {
    const calls = fakeMirakl(ids(2 * MAX + 1).map((id) => row(id)))
    const seen: string[] = []
    const sizes: Array<number | undefined> = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 250 })
      seen.push(...(await list(params)).map((r) => r.id))
      sizes.push(readUpstreamPage(params)?.pageSize)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(2 * MAX + 1))
    expect(sizes).toEqual([MAX, MAX, MAX])
    expect(hasMore).toEqual([true, true, false])
    expect(calls[0]!.params['limit']).toBe(MAX)
  })

  it('walks the token chain for a page asked for out of order', async () => {
    const calls = fakeMirakl(ids(7).map((id) => row(id)))
    const params = withPageSink({ page: 3, limit: 3 })
    const got = await list(params)
    expect(got.map((r) => r.id)).toEqual(['r7'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(3)
  })

  it('sends updatedAfter as the documented return_last_updated_from', async () => {
    const calls = fakeMirakl([
      row('old', '2025-06-01T00:00:00Z'),
      row('new', '2026-03-01T00:00:00Z'),
    ])
    const updatedAfter = new Date('2026-01-01T00:00:00.000Z')
    const got = await list(withPageSink({ page: 1, limit: 5, updatedAfter }))
    expect(calls[0]!.params).toEqual({
      limit: 5,
      return_last_updated_from: '2026-01-01T00:00:00.000Z',
    })
    expect(got.map((r) => r.id)).toEqual(['new'])
  })

  it('does not replay a token across filters', async () => {
    const calls = fakeMirakl(ids(9).map((id) => row(id)))
    await list(withPageSink({ page: 1, limit: 3 }))
    const before = calls.length
    await list(
      withPageSink({ page: 2, limit: 3, updatedAfter: new Date('2020-01-01T00:00:00.000Z') }),
    )
    const got = calls.slice(before)
    expect(got).toHaveLength(2)
    expect(got[0]!.params).not.toHaveProperty('page_token')
  })

  it('does not replay one connection’s token for another', async () => {
    const calls = fakeMirakl(ids(9).map((id) => row(id)))
    await list(withPageSink({ page: 1, limit: 3 }))
    const before = calls.length
    await list(withPageSink({ page: 2, limit: 3 }), { ...CREDS, accessToken: 'other-key' })
    const got = calls.slice(before)
    expect(got).toHaveLength(2)
    expect(got[0]!.params).not.toHaveProperty('page_token')
  })

  it('reads rows from the documented `data` key', async () => {
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async () => ({ data: { returns: [row('x')], data: [row('y')] } })),
    })) as never)
    const got = await list(withPageSink({ page: 1, limit: 5 }))
    expect(got.map((r) => r.id)).toEqual(['y'])
  })
})

describe('MiraklAdapter.getRefund filters RT11 by the documented return_id', () => {
  it('reads one return back by its id', async () => {
    const calls = fakeMirakl(ids(5).map((id) => row(id)))
    const got = RefundSchema.parse(await new MiraklAdapter().getRefund(CREDS, 'r4'))
    expect(got.id).toBe('r4')
    expect(got.orderId).toBe('o-r4')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual({ return_id: 'r4' })
  })

  it('throws when RT11 has no such return', async () => {
    fakeMirakl(ids(2).map((id) => row(id)))
    await expect(new MiraklAdapter().getRefund(CREDS, 'nope')).rejects.toThrow(/not found/)
  })

  it('returns only the row whose id matches, never another row the upstream sent', async () => {
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async () => ({ data: { data: [row('r1'), row('r4')] } })),
    })) as never)
    expect((await new MiraklAdapter().getRefund(CREDS, 'r4')).id).toBe('r4')
    await expect(new MiraklAdapter().getRefund(CREDS, 'r9')).rejects.toThrow(/not found/)
  })

  it('round-trips every id listRefunds returns', async () => {
    fakeMirakl(ids(3).map((id) => row(id)))
    const listed = await list(withPageSink({ page: 1, limit: 10 }))
    for (const r of listed) {
      expect((await new MiraklAdapter().getRefund(CREDS, r.id)).id).toBe(r.id)
    }
  })
})
