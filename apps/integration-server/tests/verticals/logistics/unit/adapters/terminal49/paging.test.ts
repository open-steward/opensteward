/**
 * Terminal49 listCarriers paging. GET /v2/shipping_lines is documented as
 * unpaginated, so the adapter used to return the whole list for every page:
 * page 2 repeated page 1.
 *
 * First-party docs:
 * https://terminal49.com/docs/api-docs/api-reference/shipping-lines/shipping-lines
 *
 *   "Return a list of shipping lines supported by Terminal49. N.B. There is no
 *   pagination for this endpoint."
 *
 * The endpoint answers the whole collection in one response, so the adapter
 * pages it locally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/logistics/adapters/terminal49/client', () => ({
  Terminal49Client: class {
    get = (path: string, params?: Record<string, unknown>) => getMock(path, params)
  },
}))

import { Terminal49Adapter } from '../../../../../../src/verticals/logistics/adapters/terminal49'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

const CREDS = { accessToken: 'TEST_key' } as Credentials
const L = 5
const N = 2 * L + 1
/** Terminal49 documents no maximum here, so only the router's global cap applies. */
const ROUTER_MAX = 500

const clean = (params?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))

/** GET /shipping_lines: no query params documented, every row in one answer. */
function fakeShippingLines(total: number) {
  const ids = Array.from({ length: total }, (_, i) => `sl-${i + 1}`)
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (path !== 'shipping_lines') throw new Error(`404: ${path}`)
    const bad = Object.keys(clean(params))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    return {
      data: ids.map((id, i) => ({
        id,
        type: 'shipping_line',
        attributes: { scac: `SC${i}`, name: `Line ${i}` },
      })),
      links: {},
    }
  })
  return ids
}

beforeEach(() => {
  getMock.mockReset()
  _resetRowPager()
})

describe('terminal49 listCarriers paging (unpaginated upstream)', () => {
  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakeShippingLines(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await new Terminal49Adapter().listCarriers(CREDS, params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request sends no paging params, which the endpoint does not document', async () => {
    fakeShippingLines(N)
    await new Terminal49Adapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    const [path, params] = getMock.mock.calls[0] as [string, Record<string, unknown>?]
    expect(path).toBe('shipping_lines')
    expect(clean(params)).toEqual({})
  })

  it('a limit above the router cap is clamped by the router and paged locally', async () => {
    const expected = fakeShippingLines(700)
    const capped = parseListQuery({ page: '1', limit: '100000' })
    expect(capped.limit).toBe(ROUTER_MAX)
    const params = withPageSink({ page: 2, limit: ROUTER_MAX })
    const rows = await new Terminal49Adapter().listCarriers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(expected.slice(ROUTER_MAX))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: false, pagedLocally: true, totalCount: 700 }),
    )
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakeShippingLines(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(
      await new Terminal49Adapter().listCarriers(CREDS, params),
      params,
      'terminal49',
    )
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, hasMore: true, totalCount: N }),
    )
  })
})
