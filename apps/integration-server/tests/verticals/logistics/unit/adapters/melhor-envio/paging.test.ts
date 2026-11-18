/**
 * Melhor Envio list paging. listShipments (GET /api/v2/me/cart) and
 * listOrders (GET /api/v2/me/orders) sent the caller's limit as `per_page` and
 * derived `page` only from an `offset`, so the caller's `page` was dropped and
 * page 2 repeated page 1.
 *
 * Both endpoints return a page-numbered envelope. First-party reference,
 * https://docs.melhorenvio.com.br/reference/listar-itens-do-carrinho.md and
 * https://docs.melhorenvio.com.br/reference/listar-etiquetas.md, example body:
 *   "first_page_url": "https://sandbox.melhorenvio.com.br/api/v2/me/orders?page=1",
 *   "next_page_url": null, ... "per_page": 10
 *
 * The only documented request parameter for paging is `page` (in the page
 * URLs); `per_page` appears only in the response, so the upstream page size is
 * not the caller's. The adapter therefore pages by rows (pageByRows) over the
 * `page` chain, following `next_page_url`, and sends no `per_page`.
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
import { MelhorEnvioAdapter } from '../../../../../../src/verticals/logistics/adapters/melhor-envio/index'

const CREDS = { accessToken: 'me_test_token', refreshToken: 'me_test_refresh' }
const OTHER = { accessToken: 'me_other_token', refreshToken: 'me_other_refresh' }
const CALL_BUDGET = 60
const L = 5
const N = 2 * L + 1
/** The documented (response-side) page size; the fake ignores anything the caller asks for. */
const UPSTREAM = 10
const BASE = 'https://sandbox.melhorenvio.com.br/api/v2/'

const DOCUMENTED: Record<string, Set<string>> = {
  'me/cart': new Set(['page']),
  'me/orders': new Set(['page', 'status']),
}

const tokenOf = (auth: string) => auth.replace(/^Bearer /, '')
const tag = (token: string) => (token === CREDS.accessToken ? '' : `${token}:`)

/**
 * A fake Melhor Envio that honours ONLY the documented query params and serves
 * fixed pages of 10 in the Laravel-style envelope the reference shows.
 */
function fakeMelhorEnvio(rows: number, perToken: Record<string, number> = {}) {
  let calls = 0
  const log: Array<{ token: string; path: string; params: Record<string, unknown> }> = []
  const gets = new Map<string, ReturnType<typeof makeGet>>()

  function makeGet(token: string) {
    const n = perToken[token] ?? rows
    return vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
      const params = Object.fromEntries(
        Object.entries(cfg?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      log.push({ token, path, params })
      const allowed = DOCUMENTED[path]
      if (!allowed) throw new Error(`unexpected path ${path}`)
      const bad = Object.keys(params).filter((k) => !allowed.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const page = params.page === undefined ? 1 : Number(params.page)
      if (!(Number.isInteger(page) && page >= 1))
        throw new Error(`400: page ${String(params.page)}`)
      const all = Array.from({ length: n }, (_, i) => ({
        id: `${tag(token)}${path}-${i + 1}`,
        status: 'pending',
      }))
      const lastPage = Math.max(1, Math.ceil(n / UPSTREAM))
      const data = all.slice((page - 1) * UPSTREAM, page * UPSTREAM)
      return {
        data: {
          current_page: page,
          data,
          first_page_url: `${BASE}${path}?page=1`,
          last_page: lastPage,
          next_page_url: page < lastPage ? `${BASE}${path}?page=${page + 1}` : null,
          per_page: UPSTREAM,
          prev_page_url: page > 1 ? `${BASE}${path}?page=${page - 1}` : null,
          total: n,
        },
      }
    })
  }

  const getFor = (token: string) => {
    let get = gets.get(token)
    if (!get) gets.set(token, (get = makeGet(token)))
    return get
  }

  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers: Record<string, string> }) => ({
    get: getFor(tokenOf(cfg.headers.Authorization!)),
    post: vi.fn(),
    delete: vi.fn(),
  })) as never)
  return { get: getFor(CREDS.accessToken), log }
}

const byId = (r: { id?: string }): string => r.id ?? '<no id>'

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

const adapter = () =>
  new MelhorEnvioAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r', sandbox: true })

type Lister = (
  a: MelhorEnvioAdapter,
  creds: typeof CREDS,
  params: ReturnType<typeof withPageSink>,
) => Promise<Array<{ id?: string }>>

const CASES: Array<[string, string, Lister]> = [
  ['listShipments', 'me/cart', (a, c, p) => a.listShipments(c, p)],
  ['listOrders', 'me/orders', (a, c, p) => a.listOrders(c, p)],
]

describe.each(CASES)('melhor-envio %s paging', (_name, path, list) => {
  const ids = (n: number, prefix = '') =>
    Array.from({ length: n }, (_, i) => `${prefix}${path}-${i + 1}`)

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeMelhorEnvio(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await list(adapter(), CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
  })

  it('walks several fixed upstream pages of 10 at a sync-sized limit', async () => {
    fakeMelhorEnvio(45)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 2; k++) {
      const params = withPageSink({ page: k, limit: 30 })
      seen.push(...(await list(adapter(), CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(45))
    expect(more).toEqual([true, false])
  })

  it('the page-2 request carries the documented key', async () => {
    const { log } = fakeMelhorEnvio(25)
    await list(adapter(), CREDS, withPageSink({ page: 1, limit: UPSTREAM }))
    await list(adapter(), CREDS, withPageSink({ page: 2, limit: UPSTREAM }))
    expect(log.every((c) => c.path === path)).toBe(true)
    expect(log.map((c) => c.params.page)).toContain(2)
    expect(log.some((c) => 'per_page' in c.params)).toBe(false)
  })

  it('stops at next_page_url: null without requesting past the last page', async () => {
    const { log } = fakeMelhorEnvio(N)
    for (let k = 1; k <= 3; k++) await list(adapter(), CREDS, withPageSink({ page: k, limit: L }))
    // 11 rows are upstream pages 1 and 2; page 2's next_page_url is null.
    expect(Math.max(...log.map((c) => Number(c.params.page)))).toBe(2)
  })

  it('a limit above the maximum is clamped', async () => {
    fakeMelhorEnvio(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await list(adapter(), CREDS, params)
    expect(rows.map(byId)).toEqual(ids(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeMelhorEnvio(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await list(adapter(), CREDS, params), params, 'melhor-envio')
    expect(env.data.map(byId)).toEqual(ids(N).slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('a second connection never reuses the first connection’s rows', async () => {
    const { log } = fakeMelhorEnvio(N, { [OTHER.accessToken]: N })
    await list(adapter(), CREDS, withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await list(adapter(), OTHER, params)
    expect(rows.map(byId)).toEqual(ids(N, `${OTHER.accessToken}:`).slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(log.filter((c) => c.token === OTHER.accessToken).length).toBeGreaterThan(0)
  })
})

describe('melhor-envio pager keys', () => {
  it('listShipments and listOrders never share a walk on one connection', async () => {
    const { log } = fakeMelhorEnvio(N)
    await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter().listOrders(CREDS, params)
    expect(rows.map(byId)).toEqual(Array.from({ length: L }, (_, i) => `me/orders-${L + i + 1}`))
    expect(log.some((c) => c.path === 'me/orders')).toBe(true)
  })

  it('sandbox and production are separate walks for the same credentials', async () => {
    // Limit 3 keeps pages 1 and 2 inside upstream page 1 (rows 1-10), so a walk
    // that shared the key would serve page 2 from its slot with no request.
    const { log } = fakeMelhorEnvio(25, { [OTHER.accessToken]: 25 })
    const production = new MelhorEnvioAdapter({
      clientId: 'c',
      clientSecret: 's',
      redirectUri: 'r',
      sandbox: false,
    })
    // Control (another connection): the same environment serves page 2 from its slot.
    await adapter().listShipments(OTHER, withPageSink({ page: 1, limit: 3 }))
    const afterControl1 = log.length
    await adapter().listShipments(OTHER, withPageSink({ page: 2, limit: 3 }))
    expect(log.length).toBe(afterControl1)

    await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: 3 }))
    const afterPage1 = log.length
    const rows = await production.listShipments(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map(byId)).toEqual(['me/cart-4', 'me/cart-5', 'me/cart-6'])
    expect(log.length).toBeGreaterThan(afterPage1)
  })
})

describe('melhor-envio bare-array response', () => {
  it('treats a bare array as the whole collection and never requests another page', async () => {
    const log: Array<Record<string, unknown>> = []
    const rows = Array.from({ length: UPSTREAM }, (_, i) => ({ id: `me/cart-${i + 1}` }))
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async (_path: string, cfg?: { params?: Record<string, unknown> }) => {
        log.push(cfg?.params ?? {})
        if (log.length > CALL_BUDGET) throw new Error('call budget exceeded')
        return { data: rows }
      }),
      post: vi.fn(),
      delete: vi.fn(),
    })) as never)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await adapter().listShipments(CREDS, params)).map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(rows.map((r) => r.id))
    expect(more).toEqual([true, false, false])
    expect(log.length).toBe(1)
  })
})
