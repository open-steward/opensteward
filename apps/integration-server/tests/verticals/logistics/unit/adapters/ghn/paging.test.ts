/**
 * GHN list paging. Two list methods ignored the caller's `page`, so page 2
 * repeated page 1.
 *
 * listWarehouses — shop/all is offset-cursor paged. First-party docs,
 * https://developer.ghn.vn/en/docs/shop/get-shop :
 *   offset: "Paging offset. Default: 0"
 *   limit:  "Page size. Default: 0"
 *   last_offset: "Offset cursor for the next page"
 * No maximum page size is documented, so none is declared or clamped to. The
 * next request's `offset` is the previous response's `last_offset`; the docs
 * name no explicit end signal, so a short (or empty) page is the end.
 *
 * listCarriers — shipping-order/available-services is not paged
 * (https://developer.ghn.vn/en/docs/master-data/get-service : "data is an
 * array of available services.") and the adapter folds it into ONE carrier
 * row, GHN itself. That one row is the whole collection, so it is paged
 * locally: page 1 has it, page 2 is empty.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { GhnAdapter } from '../../../../../../src/verticals/logistics/adapters/ghn/index'

const CREDS = { accessToken: 'ghn_test_token' }
const CALL_BUDGET = 40
const L = 5
const N = 2 * L + 1

/** The documented body keys of shop/all. */
const SHOP_KEYS = new Set(['offset', 'limit', 'client_phone'])

/**
 * A fake GHN honouring ONLY the documented shop/all params. `offset` is
 * treated as an opaque keyset cursor (the last `_id` served), as the docs'
 * own staging sample suggests (`last_offset` 200995 beside shop `_id`
 * 196560): a row-index offset would make the adapter's striding look right
 * while being wrong against the real API. Shop ids are non-contiguous for the
 * same reason.
 */
function fakeGhn(shopCount: number) {
  let calls = 0
  const log: Array<{ path: string; body: Record<string, unknown> }> = []
  const shops = Array.from({ length: shopCount }, (_, i) => ({
    _id: 1000 + i * 7,
    name: `shop ${i + 1}`,
    status: 1,
  }))
  const post = vi.fn(async (path: string, body: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    log.push({ path, body })
    if (path === 'shop/all') {
      const bad = Object.keys(body).filter((k) => !SHOP_KEYS.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const offset = Number(body.offset ?? 0)
      const limit = Number(body.limit ?? 0)
      if (offset < 0 || limit < 0) throw new Error('400: USER_ERR_COMMON')
      const after = shops.filter((s) => s._id > offset)
      const rows = limit === 0 ? after : after.slice(0, limit)
      const last = rows.length ? rows[rows.length - 1]!._id : offset
      return { data: { code: 200, message: 'Success', data: { last_offset: last, shops: rows } } }
    }
    if (path === 'shipping-order/available-services') {
      return {
        data: {
          code: 200,
          message: 'Success',
          data: [
            { service_id: 53320, short_name: 'Hàng nhẹ', service_type_id: 2 },
            { service_id: 100039, short_name: 'Hàng nặng', service_type_id: 5 },
          ],
        },
      }
    }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: vi.fn(),
    post,
    delete: vi.fn(),
  })) as never)
  return { log, shops }
}

const adapter = () => new GhnAdapter()
const sink = (page: number, limit: number): QueryParams => withPageSink({ page, limit })

beforeEach(() => _resetCursorPager())
afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('ghn listWarehouses paging (shop/all offset + last_offset)', () => {
  it('serves every shop once across pages 1..3 with exact hasMore', async () => {
    const { shops } = fakeGhn(N)
    const seen: Array<string | undefined> = []
    const more: Array<boolean | undefined> = []
    for (const k of [1, 2, 3]) {
      const params = sink(k, L)
      const rows = await adapter().listWarehouses(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(shops.map((s) => String(s._id)))
    expect(more).toEqual([true, true, false])
  })

  it("page 2 sends the previous page's last_offset as offset, at the caller's limit", async () => {
    const { log, shops } = fakeGhn(N)
    await adapter().listWarehouses(CREDS, sink(1, L))
    await adapter().listWarehouses(CREDS, sink(2, L))
    const bodies = log.filter((e) => e.path === 'shop/all').map((e) => e.body)
    expect(bodies[0]).toEqual({ offset: 0, limit: L })
    expect(bodies[bodies.length - 1]).toEqual({ offset: shops[L - 1]!._id, limit: L })
  })

  it('a direct jump to page 3 walks the chain and lands on the right rows', async () => {
    const { shops } = fakeGhn(N)
    const rows = await adapter().listWarehouses(CREDS, sink(3, L))
    expect(rows.map((r) => r.id)).toEqual(shops.slice(2 * L).map((s) => String(s._id)))
  })

  it('passes a large limit through unclamped: GHN documents no maximum', async () => {
    const { log } = fakeGhn(3)
    const params = sink(1, 1000)
    const rows = await adapter().listWarehouses(CREDS, params)
    expect(rows).toHaveLength(3)
    expect(log[0]!.body).toEqual({ offset: 0, limit: 1000 })
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const { shops } = fakeGhn(N)
    const a = adapter()
    const p1 = parseListQuery({ page: '1', limit: String(L) })
    listPage(await a.listWarehouses(CREDS, withPageSink(p1)), p1, 'ghn')
    const params = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env = listPage(await a.listWarehouses(CREDS, params), params, 'ghn')
    expect(env.data.map((w) => w.id)).toEqual(shops.slice(L, 2 * L).map((s) => String(s._id)))
    expect(env.meta.page).toBe(2)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('ghn listCarriers paging (one synthetic row, paged locally)', () => {
  it('page 1 has the GHN carrier, page 2 is empty, hasMore exact', async () => {
    fakeGhn(0)
    const p1 = sink(1, 1)
    const r1 = await adapter().listCarriers(CREDS, p1)
    expect(r1.map((c) => c.id)).toEqual(['ghn'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p1)?.totalCount).toBe(1)
    const p2 = sink(2, 1)
    expect(await adapter().listCarriers(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('API path: page 2 through parseListQuery and listPage is empty with hasMore false', async () => {
    fakeGhn(0)
    const a = adapter()
    const params = withPageSink(parseListQuery({ page: '2', limit: '1' }))
    const env = listPage(await a.listCarriers(CREDS, params), params, 'ghn')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
    expect(env.meta.totalCount).toBe(1)
  })
})

/**
 * A shop/all fake keyed by the `Token` header each GhnClient is built with,
 * so two connections see two different accounts. `stuck` makes the upstream
 * hand back a full page whose last_offset never moves past the first one.
 */
function fakeGhnByToken(shopsByToken: Record<string, number>, opts: { stuck?: number } = {}) {
  let calls = 0
  const accounts = Object.fromEntries(
    Object.entries(shopsByToken).map(([token, base]) => [
      token,
      Array.from({ length: N }, (_, i) => ({
        _id: base + i * 7,
        name: `${token} ${i}`,
        status: 1,
      })),
    ]),
  )
  vi.spyOn(axios, 'create').mockImplementation(((config: { headers?: Record<string, string> }) => {
    const token = String(config?.headers?.Token ?? '')
    const shops = accounts[token]
    if (!shops) throw new Error(`unknown token ${token}`)
    return {
      get: vi.fn(),
      delete: vi.fn(),
      post: vi.fn(async (path: string, body: Record<string, unknown>) => {
        if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
        if (path !== 'shop/all') throw new Error(`unexpected path ${path}`)
        const offset = Number(body.offset ?? 0)
        const limit = Number(body.limit ?? 0)
        if (opts.stuck !== undefined) {
          return {
            data: { code: 200, data: { last_offset: opts.stuck, shops: shops.slice(0, limit) } },
          }
        }
        const rows = shops.filter((s) => s._id > offset).slice(0, limit)
        const last = rows.length ? rows[rows.length - 1]!._id : offset
        return { data: { code: 200, data: { last_offset: last, shops: rows } } }
      }),
    }
  }) as never)
  return accounts
}

describe('ghn listWarehouses cursor chain identity', () => {
  it('two connections walking page 2 each resume from their own last_offset', async () => {
    const A = { accessToken: 'ghn_tenant_a' }
    const B = { accessToken: 'ghn_tenant_b' }
    const accounts = fakeGhnByToken({ ghn_tenant_a: 1000, ghn_tenant_b: 5000 })
    await adapter().listWarehouses(A, sink(1, L))
    await adapter().listWarehouses(B, sink(1, L))
    const a2 = await adapter().listWarehouses(A, sink(2, L))
    const b2 = await adapter().listWarehouses(B, sink(2, L))
    const ids = (t: string) => accounts[t]!.slice(L, 2 * L).map((s) => String(s._id))
    expect(a2.map((r) => r.id)).toEqual(ids('ghn_tenant_a'))
    expect(b2.map((r) => r.id)).toEqual(ids('ghn_tenant_b'))
  })

  it('a chain built at one limit is not reused at another', async () => {
    const accounts = fakeGhnByToken({ [CREDS.accessToken]: 1000 })
    await adapter().listWarehouses(CREDS, sink(1, 5))
    const p2 = await adapter().listWarehouses(CREDS, sink(2, 3))
    const shops = accounts[CREDS.accessToken]!
    expect(p2.map((r) => r.id)).toEqual(shops.slice(3, 6).map((s) => String(s._id)))
  })

  it('a full page whose last_offset does not move ends the chain', async () => {
    fakeGhnByToken({ [CREDS.accessToken]: 1000 }, { stuck: 999 })
    const p1 = sink(1, L)
    await adapter().listWarehouses(CREDS, p1)
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    const p2 = sink(2, L)
    const rows = await adapter().listWarehouses(CREDS, p2)
    expect(rows).toHaveLength(L)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })
})
