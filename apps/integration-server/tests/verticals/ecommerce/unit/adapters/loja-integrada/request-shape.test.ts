/**
 * Loja Integrada request shape and paging.
 *
 * Everything the fake honours is documented in Loja Integrada's OpenAPI
 * specification (https://api-docs.lojaintegrada.com.br/openapi/API-Loja-Integrada.json):
 *
 *  - host `servers[0].url` "https://api.awsli.com.br"; auth header
 *    `Authorization: Basic <Personal Token>` ("Autenticação");
 *  - list paging by `limit` + row `offset`, the parameters of every documented
 *    `meta.next` link (`/api/v1/produto?limit=20&offset=20`), answered in the
 *    `{ meta: { limit, next, offset, previous, total_count }, objects }`
 *    envelope, `next` null on the last page;
 *  - GET /v1/pedido/search: "**limit**: indica a quantidade de pedidos por
 *    página (o máximo aceito é 50)", "**offset**: indica a posição do
 *    primeiro pedido, na ordem, para o resultado.", and `since_atualizado`
 *    ("A data deve estar no formato AAAA-MM-DDTHH:MM:SS");
 *  - GET /v1/produto: filters `sku`, `ativo`, `removido`,
 *    `data_modificacao__gte` / `__lte` ("O formato da data é: 2022-01-01
 *    10:20:00"); variation children carry `tipo: "atributo_opcao"`;
 *  - GET /v1/cliente: `order_by` ("data_modificacao" or "-data_modificacao").
 *
 * What the API does with a `limit` above 50 on /v1/pedido/search is not
 * documented, so the fake rejects it: the adapter must never send one.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { LojaIntegradaAdapter } from '../../../../../../src/verticals/ecommerce/adapters/loja-integrada/index'
import { PEDIDO_DETAIL } from './fixtures'

const CREDS = { accessToken: 'pt_test_token' }
const HOST = 'https://api.awsli.com.br'

type Row = Record<string, unknown>

interface PathSpec {
  rows: Row[]
  /** Query parameters the specification documents for this path, beside limit/offset. */
  filters: readonly string[]
  /** Documented maximum `limit`; above it the fake rejects the request. */
  maxLimit?: number
  /** A server that serves at most this many rows per request (an undocumented cap). */
  cutTo?: number
  /** Rows as a function of the query, for a filter that changes the row set. */
  rowsFor?: (params: Record<string, unknown>) => Row[]
  /** Answer without the documented `meta` block, or with one that lacks `next`. */
  noMeta?: 'block' | 'next'
}

interface Recorded {
  path: string
  params: Record<string, unknown>
}

/**
 * A fake api.awsli.com.br. GETs on a list path page `rows` by `offset` +
 * `limit` only; anything else in the query must be one of the path's
 * documented filters. Single-record GETs answer from `records`.
 */
function fakeApi(lists: Record<string, PathSpec>, records: Record<string, unknown> = {}) {
  const calls: Recorded[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    const spec = lists[path]
    if (!spec) {
      if (path in records) return { data: records[path] }
      throw new Error(`unexpected path ${path}`)
    }
    const extra = Object.keys(params).filter(
      (k) => k !== 'limit' && k !== 'offset' && !spec.filters.includes(k),
    )
    if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
    const offset = params['offset'] ?? 0
    const asked = params['limit'] ?? 20
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      throw new Error(`offset must be an integer >= 0 (got ${String(offset)})`)
    }
    if (typeof asked !== 'number' || !Number.isInteger(asked) || asked < 1) {
      throw new Error(`limit must be an integer >= 1 (got ${String(asked)})`)
    }
    if (spec.maxLimit !== undefined && asked > spec.maxLimit) {
      throw new Error(`limit ${asked} is above the documented maximum ${spec.maxLimit}`)
    }
    const limit = spec.cutTo !== undefined ? Math.min(asked, spec.cutTo) : asked
    const all = spec.rowsFor ? spec.rowsFor(params) : spec.rows
    const objects = all.slice(offset, offset + limit)
    const total = all.length
    if (spec.noMeta === 'block') return { data: { objects } }
    if (spec.noMeta === 'next')
      return { data: { meta: { limit, offset, total_count: total }, objects } }
    const next =
      offset + limit < total ? `/api${path}?limit=${limit}&offset=${offset + limit}` : null
    return {
      data: { meta: { limit, next, offset, previous: null, total_count: total }, objects },
    }
  })
  const create = vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get, create, calls }
}

function params(page: number, limit: number, extra: Partial<QueryParams> = {}): QueryParams {
  return withPageSink({ page, limit, ...extra })
}

const categorias = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: 1000 + i, nome: `Categoria ${i}`, descricao: null }))
const clientes = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: 2000 + i, nome: `Cliente ${i}`, email: null }))
const pedidos = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ numero: 3000 + i, cliente: `/api/v1/cliente/${i}` }))
const cupons = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: 4000 + i, codigo: `C${i}`, tipo: 'porcentagem' }))

interface OffsetList {
  name: string
  path: string
  filters: readonly string[]
  maxLimit?: number
  make: (n: number) => Row[]
  call: (a: LojaIntegradaAdapter, p: QueryParams) => Promise<Array<{ id: string }>>
}

const OFFSET_LISTS: readonly OffsetList[] = [
  {
    name: 'listCollections',
    path: '/v1/categoria',
    filters: [],
    make: categorias,
    call: (a, p) => a.listCollections(CREDS, p),
  },
  {
    name: 'listCustomers',
    path: '/v1/cliente',
    filters: ['order_by'],
    make: clientes,
    call: (a, p) => a.listCustomers(CREDS, p),
  },
  {
    name: 'listOrders',
    path: '/v1/pedido/search',
    filters: [
      'since_numero',
      'since_atualizado',
      'cliente_id',
      'pagamento_id',
      'situacao_id',
      'since_criado',
      'until_criado',
    ],
    maxLimit: 50,
    make: pedidos,
    call: (a, p) => a.listOrders(CREDS, p),
  },
  {
    name: 'listDiscounts',
    path: '/v1/cupom',
    filters: [],
    make: cupons,
    call: (a, p) => a.listDiscounts(CREDS, p),
  },
]

beforeEach(() => {
  _resetRowPager()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Loja Integrada client', () => {
  it('sends Authorization: Basic <Personal Token> to https://api.awsli.com.br', async () => {
    const { create } = fakeApi({ '/v1/categoria': { rows: categorias(1), filters: [] } })
    await new LojaIntegradaAdapter().listCollections(CREDS, params(1, 10))
    const cfg = create.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe(HOST)
    expect(cfg.headers['Authorization']).toBe('Basic pt_test_token')
    expect(Object.keys(cfg.headers)).not.toContain('X-Shopify-Access-Token')
  })

  it('fills a page the server capped, from where it stopped, instead of passing on a short page', async () => {
    const { calls } = fakeApi({ '/v1/categoria': { rows: categorias(70), filters: [], cutTo: 20 } })
    const adapter = new LojaIntegradaAdapter()
    const p1 = params(1, 30)
    const first = await adapter.listCollections(CREDS, p1)
    expect(first.map((c) => c.id)).toEqual(categorias(30).map((r) => String(r['id'])))
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, totalCount: 70 })
    const p3 = params(3, 30)
    const third = await adapter.listCollections(CREDS, p3)
    expect(third.map((c) => c.id)).toEqual(
      categorias(70)
        .slice(60)
        .map((r) => String(r['id'])),
    )
    expect(readUpstreamPage(p3)).toMatchObject({ hasMore: false })
    expect(calls.map((c) => [c.params['offset'], c.params['limit']])).toEqual([
      [0, 30],
      [20, 10],
      [60, 30],
    ])
  })

  it.each(['block', 'next'] as const)(
    'throws on an answer without meta.next, the documented end signal (missing %s)',
    async (noMeta) => {
      fakeApi({ '/v1/categoria': { rows: categorias(3), filters: [], noMeta } })
      await expect(
        new LojaIntegradaAdapter().listCollections(CREDS, params(1, 10)),
      ).rejects.toThrow(/without meta\.next/)
    },
  )

  it('reads an empty answer without meta as the end of the list', async () => {
    fakeApi({ '/v1/categoria': { rows: [], filters: [], noMeta: 'block' } })
    const p = params(1, 10)
    await expect(new LojaIntegradaAdapter().listCollections(CREDS, p)).resolves.toEqual([])
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
  })

  it('throws on an empty answer whose meta.next still names a following page', async () => {
    const get = vi.fn(async () => ({
      data: {
        meta: { limit: 10, next: '/api/v1/categoria?limit=10&offset=10', offset: 0 },
        objects: [],
      },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    await expect(new LojaIntegradaAdapter().listCollections(CREDS, params(1, 10))).rejects.toThrow(
      /no rows at offset 0/,
    )
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('refuses to connect without a Personal Token, before building a client', async () => {
    const { create } = fakeApi({ '/v1/categoria': { rows: categorias(1), filters: [] } })
    await expect(
      new LojaIntegradaAdapter().listCollections({} as typeof CREDS, params(1, 10)),
    ).rejects.toThrow(/Personal Token/)
    expect(create).not.toHaveBeenCalled()
  })

  it('sends a whole page size when the caller asks for a fractional one', async () => {
    const { calls } = fakeApi({ '/v1/categoria': { rows: categorias(10), filters: [] } })
    await new LojaIntegradaAdapter().listCollections(CREDS, params(1, 7.5))
    expect(calls[0]!.params).toEqual({ limit: 7, offset: 0 })
  })
})

describe.each(OFFSET_LISTS)('$name pages by offset + limit', (m) => {
  const L = 5
  const N = 2 * L + 1

  it('walks N = 2L+1 rows: every id once, hasMore and totalCount exact', async () => {
    const { calls } = fakeApi({
      [m.path]: { rows: m.make(N), filters: m.filters, maxLimit: m.maxLimit },
    })
    const adapter = new LojaIntegradaAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const p = params(page, L)
      const rows = await m.call(adapter, p)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(p)?.hasMore)
      expect(readUpstreamPage(p)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(m.make(N).map((r) => String(r['id'] ?? r['numero'])))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
    expect(calls.map((c) => [c.path, c.params['offset'], c.params['limit']])).toEqual([
      [m.path, 0, L],
      [m.path, L, L],
      [m.path, 2 * L, L],
    ])
  })

  it('reports hasMore from meta.next, not from a full page: N = 2L ends on page 2', async () => {
    fakeApi({ [m.path]: { rows: m.make(2 * L), filters: m.filters, maxLimit: m.maxLimit } })
    const adapter = new LojaIntegradaAdapter()
    const p2 = params(2, L)
    const rows = await m.call(adapter, p2)
    expect(rows).toHaveLength(L)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('sends only the documented paging parameters when no filter applies', async () => {
    const { calls } = fakeApi({
      [m.path]: { rows: m.make(3), filters: m.filters, maxLimit: m.maxLimit },
    })
    await m.call(new LojaIntegradaAdapter(), params(1, 7))
    expect(calls[0]!.params).toEqual({ limit: 7, offset: 0 })
  })
})

describe('listOrders', () => {
  it('clamps the page to the documented maximum of 50 and reports that size', async () => {
    const { calls } = fakeApi({
      '/v1/pedido/search': { rows: pedidos(120), filters: [], maxLimit: 50 },
    })
    const adapter = new LojaIntegradaAdapter()
    const p1 = params(1, 100)
    const first = await adapter.listOrders(CREDS, p1)
    const p2 = params(2, 100)
    const second = await adapter.listOrders(CREDS, p2)
    expect(first.map((o) => o.id)).toEqual(pedidos(50).map((r) => String(r['numero'])))
    expect(second[0]!.id).toBe('3050')
    expect(readUpstreamPage(p1)).toMatchObject({ pageSize: 50, hasMore: true, totalCount: 120 })
    expect(calls.map((c) => [c.params['offset'], c.params['limit']])).toEqual([
      [0, 50],
      [50, 50],
    ])
  })

  it('sends updatedAfter as since_atualizado, widened by 12 h for its undocumented zone', async () => {
    const { calls } = fakeApi({
      '/v1/pedido/search': {
        rows: pedidos(1),
        filters: ['since_atualizado'],
        maxLimit: 50,
      },
    })
    await new LojaIntegradaAdapter().listOrders(
      CREDS,
      params(1, 10, { updatedAfter: new Date('2025-03-01T08:30:22Z') }),
    )
    expect(calls[0]!.params).toEqual({
      since_atualizado: '2025-02-28T20:30:22',
      limit: 10,
      offset: 0,
    })
  })
})

describe('listCustomers', () => {
  it('with updatedAfter, pages GET /v1/cliente/search by since_atualizado, widened by 12 h', async () => {
    const { calls } = fakeApi({
      '/v1/cliente/search': {
        rows: clientes(11),
        filters: [
          'cliente_email',
          'since_criado',
          'until_criado',
          'since_atualizado',
          'until_atualizado',
        ],
      },
    })
    const adapter = new LojaIntegradaAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const p = params(page, 5, { updatedAfter: new Date('2023-07-21T16:00:01Z') })
      seen.push(...(await adapter.listCustomers(CREDS, p)).map((c) => c.id))
      more.push(readUpstreamPage(p)?.hasMore)
    }
    expect(seen).toEqual(clientes(11).map((r) => String(r['id'])))
    expect(more).toEqual([true, true, false])
    expect(calls.map((c) => [c.path, c.params])).toEqual([
      ['/v1/cliente/search', { since_atualizado: '2023-07-21T04:00:01', limit: 5, offset: 0 }],
      ['/v1/cliente/search', { since_atualizado: '2023-07-21T04:00:01', limit: 5, offset: 5 }],
      ['/v1/cliente/search', { since_atualizado: '2023-07-21T04:00:01', limit: 5, offset: 10 }],
    ])
  })
})

describe('listProducts', () => {
  /**
   * A /v1/produto stream as documented: products (`normal`, `atributo`) with
   * their variation children (`atributo_opcao`) interleaved, so each upstream
   * page holds an uneven number of products.
   */
  function produtos(): Row[] {
    const rows: Row[] = []
    let id = 5000
    for (let i = 0; i < 11; i++) {
      rows.push({ id: id++, nome: `Produto ${i}`, tipo: i % 3 === 0 ? 'atributo' : 'normal' })
      if (i % 3 === 0) {
        rows.push({ id: id++, nome: null, tipo: 'atributo_opcao' })
        rows.push({ id: id++, nome: null, tipo: 'atributo_opcao' })
      }
    }
    return rows
  }
  const productIds = produtos()
    .filter((r) => r['tipo'] !== 'atributo_opcao')
    .map((r) => String(r['id']))

  it('walks N = 2L+1 products over uneven upstream pages: every product once, no child, hasMore exact', async () => {
    const L = 5
    expect(productIds.length).toBe(2 * L + 1)
    const { calls } = fakeApi({
      '/v1/produto': { rows: produtos(), filters: ['data_modificacao__gte'] },
    })
    const adapter = new LojaIntegradaAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const p = params(page, L)
      const rows = await adapter.listProducts(CREDS, p)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(p)?.hasMore)
      expect(readUpstreamPage(p)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(productIds)
    expect(more).toEqual([true, true, false])
    for (const c of calls) {
      expect(c.path).toBe('/v1/produto')
      expect(c.params['limit']).toBe(L)
      expect((c.params['offset'] as number) % L).toBe(0)
    }
    // Upstream pages hold 3, 4, 3, 4, 3 products: uneven, and each fetched once.
    expect(new Set(calls.map((c) => c.params['offset'])).size).toBe(calls.length)
  })

  it("keys its row pager by connection: a second store never gets the first store's rows", async () => {
    fakeApi({ '/v1/produto': { rows: produtos(), filters: [] } })
    const adapter = new LojaIntegradaAdapter()
    await adapter.listProducts({ accessToken: 'store-a' }, params(1, 5))
    const other: Row[] = produtos().map((r) => ({ ...r, id: (r['id'] as number) + 90000 }))
    fakeApi({ '/v1/produto': { rows: other, filters: [] } })
    const rows = await adapter.listProducts({ accessToken: 'store-b' }, params(2, 5))
    expect(rows.map((r) => r.id)).toEqual(
      other
        .filter((r) => r['tipo'] !== 'atributo_opcao')
        .slice(5, 10)
        .map((r) => String(r['id'])),
    )
  })

  it('keys its row pager by page size: a walk at 3 never resumes from positions a walk at 5 recorded', async () => {
    const { calls } = fakeApi({ '/v1/produto': { rows: produtos(), filters: [] } })
    const adapter = new LojaIntegradaAdapter()
    for (let page = 1; page <= 3; page++) await adapter.listProducts(CREDS, params(page, 5))
    calls.length = 0
    const rows = await adapter.listProducts(CREDS, params(3, 3))
    expect(rows.map((r) => r.id)).toEqual(productIds.slice(6, 9))
    // Its upstream pages are its own: 3 rows each, from row 0.
    for (const c of calls) {
      expect(c.params['limit']).toBe(3)
      expect((c.params['offset'] as number) % 3).toBe(0)
    }
  })

  it('keys its row pager by filter: a filtered page never comes from the unfiltered walk', async () => {
    const recent = produtos().slice(-6)
    fakeApi({
      '/v1/produto': {
        rows: produtos(),
        filters: ['data_modificacao__gte'],
        rowsFor: (q) => ('data_modificacao__gte' in q ? recent : produtos()),
      },
    })
    const adapter = new LojaIntegradaAdapter()
    await adapter.listProducts(CREDS, params(1, 2))
    await adapter.listProducts(CREDS, params(2, 2))
    const rows = await adapter.listProducts(
      CREDS,
      params(2, 2, { updatedAfter: new Date('2022-01-20T10:00:00Z') }),
    )
    expect(rows.map((r) => r.id)).toEqual(
      recent
        .filter((r) => r['tipo'] !== 'atributo_opcao')
        .slice(2, 4)
        .map((r) => String(r['id'])),
    )
  })

  it('throws on an answer without meta.next rather than ending the walk', async () => {
    fakeApi({ '/v1/produto': { rows: produtos(), filters: [], noMeta: 'next' } })
    await expect(new LojaIntegradaAdapter().listProducts(CREDS, params(1, 5))).rejects.toThrow(
      /without meta\.next/,
    )
  })

  it('getProduct on a variation child is a 404, not a product', async () => {
    fakeApi({}, { '/v1/produto/5001': { id: 5001, nome: null, tipo: 'atributo_opcao' } })
    await expect(new LojaIntegradaAdapter().getProduct(CREDS, '5001')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('sends updatedAfter as data_modificacao__gte in the documented date format, widened by 12 h', async () => {
    const { calls } = fakeApi({
      '/v1/produto': { rows: produtos(), filters: ['data_modificacao__gte'] },
    })
    await new LojaIntegradaAdapter().listProducts(
      CREDS,
      params(1, 10, { updatedAfter: new Date('2022-01-20T10:00:00Z') }),
    )
    expect(calls[0]!.params).toEqual({
      data_modificacao__gte: '2022-01-19 22:00:00',
      limit: 10,
      offset: 0,
    })
  })
})

describe('single-record reads use the documented resource paths', () => {
  it.each([
    ['getProduct', '/v1/produto/202591789', { id: 202591789, nome: 'Produto teste novo' }],
    ['getCollection', '/v1/categoria/7645875', { id: 7645875, nome: 'Feminino' }],
    ['getCustomer', '/v1/cliente/52759204', { id: 52759204, nome: 'João Exemplo' }],
    ['getOrder', '/v1/pedido/165', PEDIDO_DETAIL],
    ['getDiscount', '/v1/cupom/1469590', { id: 1469590, codigo: 'CUPOM15OFF' }],
  ] as const)('%s → GET %s', async (method, path, body) => {
    const { calls } = fakeApi({}, { [path]: body })
    const id = path.split('/').pop()!
    const adapter = new LojaIntegradaAdapter()
    const got = await (adapter[method] as (c: typeof CREDS, id: string) => Promise<{ id: string }>)(
      CREDS,
      id,
    )
    expect(got.id).toBe(id)
    expect(calls).toEqual([{ path, params: {} }])
  })
})

describe('fulfillments and transactions come from the order', () => {
  const records = { '/v1/pedido/165': PEDIDO_DETAIL }

  it('listFulfillments reads envios of GET /v1/pedido/{order_id}', async () => {
    const { calls } = fakeApi({}, records)
    const p = params(1, 10, { order_id: '165' })
    const rows = await new LojaIntegradaAdapter().listFulfillments(CREDS, p)
    expect(rows.map((r) => r.id)).toEqual(['165:69291055'])
    expect(readUpstreamPage(p)).toMatchObject({ totalCount: 1, hasMore: false, pagedLocally: true })
    expect(calls.map((c) => c.path)).toEqual(['/v1/pedido/165'])
  })

  it('getFulfillment reads the shipment back through its order', async () => {
    fakeApi({}, records)
    const f = await new LojaIntegradaAdapter().getFulfillment(CREDS, '165:69291055')
    expect(f).toMatchObject({ id: '165:69291055', orderId: '165', carrier: 'Enviali' })
    await expect(new LojaIntegradaAdapter().getFulfillment(CREDS, '165:1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('listTransactions reads pagamentos of GET /v1/pedido/{order_id}, and getTransaction reads one back', async () => {
    const { calls } = fakeApi({}, records)
    const adapter = new LojaIntegradaAdapter()
    const p = params(1, 10, { orderId: '165' })
    const rows = await adapter.listTransactions(CREDS, p)
    expect(rows.map((r) => r.id)).toEqual(['165:69291176'])
    expect(readUpstreamPage(p)).toMatchObject({ totalCount: 1, hasMore: false, pagedLocally: true })
    const t = await adapter.getTransaction(CREDS, '165:69291176')
    expect(t.gateway).toBe('pagsegurov2')
    expect(calls.map((c) => c.path)).toEqual(['/v1/pedido/165', '/v1/pedido/165'])
  })

  it('getTransaction is a 404 when the order has no such payment', async () => {
    fakeApi({}, records)
    await expect(new LojaIntegradaAdapter().getTransaction(CREDS, '165:1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it.each(['165', '165:69291176:9', ':69291176'])(
    'a malformed child id (%s) is a 400, sent nowhere',
    async (id) => {
      const { get } = fakeApi({}, records)
      await expect(new LojaIntegradaAdapter().getTransaction(CREDS, id)).rejects.toMatchObject({
        statusCode: 400,
      })
      await expect(new LojaIntegradaAdapter().getFulfillment(CREDS, id)).rejects.toMatchObject({
        statusCode: 400,
      })
      expect(get).not.toHaveBeenCalled()
    },
  )
})

describe('refusals: 501 NOT_SUPPORTED before any request', () => {
  const adapter = new LojaIntegradaAdapter()
  it.each([
    ['listLocations', () => adapter.listLocations(CREDS, params(1, 10))],
    ['getLocation', () => adapter.getLocation(CREDS, '1')],
    ['listVariants', () => adapter.listVariants(CREDS, params(1, 10))],
    ['getVariant', () => adapter.getVariant(CREDS, '1')],
    ['listInventoryLevels', () => adapter.listInventoryLevels(CREDS, params(1, 10))],
    ['listRefunds', () => adapter.listRefunds(CREDS, params(1, 10))],
    ['getRefund', () => adapter.getRefund(CREDS, '1:2')],
  ] as const)('%s', async (_name, call) => {
    const { get, create } = fakeApi({})
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(create).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })
})

describe('connection', () => {
  it('collects the Personal Token as the access token', async () => {
    const adapter = new LojaIntegradaAdapter()
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['personalToken'])
    await expect(adapter.exchangeCredentials({ personalToken: ' abc ' })).resolves.toEqual({
      accessToken: 'abc',
    })
  })

  it('has no OAuth authorize URL', () => {
    expect(() => new LojaIntegradaAdapter().getAuthUrl('state')).toThrow(/Personal Token/)
  })
})
