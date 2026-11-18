/**
 * odoo-inventory over the shared Odoo client, against a JSON-2 / JSON-RPC fake
 * that honours only what Odoo documents.
 *
 * https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 * https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
 *   "offset and limit parameters are available to only retrieve a subset of all matched records."
 *
 * The adapter used to be a Cin7 Core clone: GET /productList etc. against a
 * hard-coded https://example.odoo.com/jsonrpc, and an X-Odoo-Signature webhook
 * HMAC that Odoo does not send.
 */
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetOdooUidCache,
  readUpstreamPage,
  setDnsResolver,
  withPageSink,
} from '@opensteward/shared'
import { OdooInventoryAdapter } from '../../../../../../src/verticals/inventory/adapters/odoo-inventory'
import { OdooInventoryWebhookHandler } from '../../../../../../src/verticals/inventory/adapters/odoo-inventory/webhook'
import { metadata } from '../../../../../../src/verticals/inventory/adapters/odoo-inventory/metadata'
import {
  ProductSchema,
  PurchaseOrderSchema,
  StockLevelSchema,
  StockTransferSchema,
  LocationSchema,
} from '../../../../../../src/verticals/inventory/schema'

const KEY = 'odoo_key'
const BASE = 'https://acme.odoo.com'
const CREDS = { accessToken: KEY, extra: { baseUrl: BASE, database: 'acme', apiVersion: 'json2' } }
const RPC_CREDS = {
  accessToken: KEY,
  extra: { baseUrl: BASE, database: 'acme', login: 'bot@acme.com', apiVersion: 'rpc' },
}

type Row = Record<string, unknown> & { id: number }
interface Sent {
  path: string
  headers: Headers
  body: Record<string, unknown>
}

function idOf(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v
}

function matches(row: Row, domain: unknown[]): boolean {
  return domain.every((c) => {
    const [f, op, v] = c as [string, string, unknown]
    const have = f in row ? idOf(row[f]) : undefined
    if (have === undefined) throw new Error(`fake: row has no ${f}`)
    if (op === '=') return have === v
    if (op === 'in') return (v as unknown[]).includes(have)
    throw new Error(`fake: unsupported operator ${op}`)
  })
}

/** Fields each model has (19.0 source, see the transform tests), plus the dotted search paths. */
const MODEL_FIELDS: Record<string, string[]> = {
  'product.product': [
    'id',
    'name',
    'default_code',
    'barcode',
    'categ_id',
    'lst_price',
    'currency_id',
    'standard_price',
    'cost_currency_id',
    'active',
    'product_tmpl_id',
    'create_date',
    'write_date',
  ],
  'stock.quant': [
    'id',
    'product_id',
    'location_id',
    'warehouse_id',
    'lot_id',
    'quantity',
    'reserved_quantity',
    'available_quantity',
  ],
  'stock.location': [
    'id',
    'name',
    'complete_name',
    'usage',
    'location_id',
    'active',
    'warehouse_id',
    'barcode',
  ],
  'stock.picking': [
    'id',
    'name',
    'origin',
    'state',
    'scheduled_date',
    'date_done',
    'location_id',
    'location_dest_id',
    'picking_type_code',
  ],
  'stock.move': ['id', 'picking_id', 'product_id', 'product_uom_qty', 'quantity'],
  'purchase.order': [
    'id',
    'name',
    'partner_id',
    'partner_ref',
    'state',
    'currency_id',
    'amount_untaxed',
    'amount_total',
    'date_order',
    'date_approve',
    'date_planned',
  ],
  'purchase.order.line': [
    'id',
    'order_id',
    'product_id',
    'product_qty',
    'qty_received',
    'price_unit',
    'price_subtotal',
    'display_type',
  ],
}

/**
 * The RPC route serves Odoo 14–18; there the fake is Odoo 14.0, the oldest, whose
 * field sets differ from 19.0's (odoo/odoo 14.0 sources):
 *   - stock.move has no `quantity` (new in 17.0, stock_move.py:158) but
 *     `quantity_done = fields.Float('Quantity Done', …)` (14.0 stock_move.py:161).
 *   - stock.quant has no `warehouse_id` (new in 16.0, stock_quant.py:72).
 *   - stock.location has no `warehouse_id` (new in 15.0, stock_location.py:91).
 * Odoo 14's read raises on a field the model lacks: raise ValueError("Invalid
 * field %r on model %r" % (fname, self._name)) (odoo/models.py 14.0), so the
 * fake refuses one; the shared client asks fields_get first.
 */
const ODOO_14_FIELDS: Record<string, { drop: string[]; add: string[] }> = {
  'stock.move': { drop: ['quantity'], add: ['quantity_done'] },
  'stock.quant': { drop: ['warehouse_id'], add: [] },
  'stock.location': { drop: ['warehouse_id'], add: [] },
}

function fakeOdoo(stores: Record<string, Row[]>) {
  const sent: Sent[] = []
  function handle(model: string, method: string, body: Record<string, unknown>, rpc = false) {
    const all = MODEL_FIELDS[model]
    const v14 = ODOO_14_FIELDS[model]
    const fields =
      rpc && all && v14 ? [...all.filter((f) => !v14.drop.includes(f)), ...v14.add] : all
    if (!fields)
      return { status: 404, body: { name: 'werkzeug.exceptions.NotFound', message: model } }
    if (method === 'fields_get') {
      return { status: 200, body: Object.fromEntries(fields.map((f) => [f, { type: 'char' }])) }
    }
    const asked = (body['fields'] as string[] | undefined) ?? []
    const bad = asked.find((f) => !fields.includes(f))
    if (bad)
      return {
        status: 500,
        body: { name: 'builtins.ValueError', message: `Invalid field '${bad}'` },
      }
    const store = stores[model] ?? []
    const pick = (r: Row) =>
      Object.fromEntries([['id', r.id], ...asked.map((f) => [f, r[f] ?? false])])
    if (method === 'read') {
      const ids = body['ids'] as number[]
      return { status: 200, body: store.filter((r) => ids.includes(r.id)).map(pick) }
    }
    const hits = store.filter((r) => matches(r, (body['domain'] as unknown[]) ?? []))
    if (method === 'search_count') return { status: 200, body: hits.length }
    const ordered = body['order'] === 'id asc' ? [...hits].sort((a, b) => a.id - b.id) : hits
    const offset = (body['offset'] as number | undefined) ?? 0
    const limit = body['limit'] as number | undefined
    return {
      status: 200,
      body: ordered.slice(offset, limit === undefined ? undefined : offset + limit).map(pick),
    }
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    if (url.origin !== BASE || init?.method !== 'POST') return Response.json({}, { status: 404 })
    if (url.pathname === '/jsonrpc') {
      const id = body['id'] ?? null
      const { service, method, args } = body['params'] as {
        service: string
        method: string
        args: unknown[]
      }
      const ok = (result: unknown) => Response.json({ jsonrpc: '2.0', id, result })
      if (service === 'common' && method === 'authenticate') {
        return ok(args[0] === 'acme' && args[1] === 'bot@acme.com' && args[2] === KEY ? 7 : false)
      }
      const [, , , model, m, pos, kw] = args as [
        string,
        number,
        string,
        string,
        string,
        unknown[],
        Record<string, unknown>,
      ]
      if (m !== 'fields_get') sent.push({ path: `rpc:${model}/${m}`, headers, body: { pos, kw } })
      const named =
        m === 'read' ? { ids: pos[0], ...kw } : m === 'fields_get' ? kw : { domain: pos[0], ...kw }
      const r = handle(model, m, named, true)
      if (r.status !== 200) {
        const { name, message } = r.body as { name: string; message: string }
        return Response.json({
          jsonrpc: '2.0',
          id,
          error: { code: 200, message: 'Odoo Server Error', data: { name, message } },
        })
      }
      return ok(r.body)
    }
    const m = /^\/json\/2\/([^/]+)\/([^/]+)$/.exec(url.pathname)
    if (!m) return Response.json({}, { status: 404 })
    if (m[2] !== 'fields_get') sent.push({ path: url.pathname, headers, body })
    if (headers.get('authorization') !== `bearer ${KEY}`) {
      return Response.json(
        { name: 'werkzeug.exceptions.Unauthorized', message: 'Invalid apikey' },
        { status: 401 },
      )
    }
    const r = handle(m[1]!, m[2]!, body)
    return Response.json(r.body, { status: r.status })
  })
  return sent
}

const product = (id: number): Row => ({
  id,
  name: `Product ${id}`,
  default_code: `SKU-${id}`,
  barcode: false,
  categ_id: [1, 'All'],
  lst_price: 10,
  currency_id: [1, 'USD'],
  standard_price: 4,
  cost_currency_id: [1, 'USD'],
  active: true,
  product_tmpl_id: [id, `Product ${id}`],
  create_date: '2026-01-01 00:00:00',
  write_date: '2026-01-02 00:00:00',
})

const quant = (id: number, usage: string): Row => ({
  id,
  product_id: [1, 'Product 1'],
  location_id: [id, `Loc ${id}`],
  'location_id.usage': usage,
  warehouse_id: [1, 'WH'],
  lot_id: false,
  quantity: 5,
  reserved_quantity: 1,
  available_quantity: 4,
})

const picking = (id: number, code: string): Row => ({
  id,
  name: `WH/INT/${id}`,
  origin: false,
  state: 'done',
  scheduled_date: '2026-01-01 00:00:00',
  date_done: '2026-01-02 00:00:00',
  location_id: [8, 'WH/Stock'],
  location_dest_id: [9, 'WH/Shelf'],
  picking_type_code: code,
  'picking_type_id.code': code,
})

beforeEach(() => {
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
  _resetOdooUidCache()
})
afterEach(() => {
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

describe('odoo-inventory request shape', () => {
  it('posts product.product search_read to /json/2 with the bearer key and database', async () => {
    const sent = fakeOdoo({ 'product.product': [product(1)] })
    const rows = await new OdooInventoryAdapter().listProducts(CREDS, { page: 1, limit: 5 })
    rows.forEach((r) => ProductSchema.parse(r))
    expect(sent[0]!.path).toBe('/json/2/product.product/search_read')
    expect(sent[0]!.headers.get('authorization')).toBe(`bearer ${KEY}`)
    expect(sent[0]!.headers.get('x-odoo-database')).toBe('acme')
    expect(sent[0]!.body).toMatchObject({ domain: [], offset: 0, limit: 5, order: 'id asc' })
  })

  it('never calls the Cin7 paths or example.odoo.com', async () => {
    const sent = fakeOdoo({ 'product.product': [product(1)] })
    await new OdooInventoryAdapter().listProducts(CREDS, { page: 1, limit: 5 })
    for (const s of sent) expect(s.path).not.toMatch(/productList|example\.odoo\.com/)
  })

  it('reads stock levels from quants in internal and transit locations only', async () => {
    const sent = fakeOdoo({
      'stock.quant': [quant(1, 'internal'), quant(2, 'customer'), quant(3, 'transit')],
    })
    const rows = await new OdooInventoryAdapter().listStockLevels(CREDS, { page: 1, limit: 10 })
    rows.forEach((r) => StockLevelSchema.parse(r))
    expect(rows.map((r) => r.id)).toEqual(['1', '3'])
    expect(sent[0]!.body['domain']).toEqual([['location_id.usage', 'in', ['internal', 'transit']]])
  })

  it('lists locations from stock.location', async () => {
    const sent = fakeOdoo({
      'stock.location': [
        {
          id: 8,
          name: 'Stock',
          complete_name: 'WH/Stock',
          usage: 'internal',
          location_id: [7, 'WH'],
          active: true,
          warehouse_id: [1, 'WH'],
          barcode: false,
        },
      ],
    })
    const rows = await new OdooInventoryAdapter().listLocations(CREDS, { page: 1, limit: 10 })
    rows.forEach((r) => LocationSchema.parse(r))
    expect(sent[0]!.path).toBe('/json/2/stock.location/search_read')
  })

  it('stock transfers are internal pickings, with their moves read by picking_id', async () => {
    const sent = fakeOdoo({
      'stock.picking': [picking(1, 'internal'), picking(2, 'incoming')],
      'stock.move': [
        {
          id: 10,
          picking_id: [1, 'WH/INT/1'],
          product_id: [1, 'P'],
          product_uom_qty: 3,
          quantity: 3,
        },
        {
          id: 11,
          picking_id: [2, 'WH/IN/2'],
          product_id: [1, 'P'],
          product_uom_qty: 9,
          quantity: 9,
        },
      ],
    })
    const rows = await new OdooInventoryAdapter().listStockTransfers(CREDS, { page: 1, limit: 10 })
    rows.forEach((r) => StockTransferSchema.parse(r))
    expect(rows.map((r) => r.id)).toEqual(['1'])
    expect(rows[0]!.lines).toEqual([{ productId: '1', quantity: 3, quantityReceived: 3 }])
    expect(sent[0]!.body['domain']).toEqual([['picking_type_id.code', '=', 'internal']])
    expect(sent[1]!.path).toBe('/json/2/stock.move/search_read')
    expect(sent[1]!.body['domain']).toEqual([['picking_id', 'in', [1]]])
  })

  it('getStockTransfer 404s a picking that is not an internal transfer', async () => {
    fakeOdoo({ 'stock.picking': [picking(2, 'incoming')], 'stock.move': [] })
    await expect(new OdooInventoryAdapter().getStockTransfer(CREDS, '2')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('purchase orders read their lines by order_id, skipping section and note lines', async () => {
    const sent = fakeOdoo({
      'purchase.order': [
        {
          id: 4,
          name: 'P00004',
          partner_id: [14, 'Azure'],
          partner_ref: false,
          state: 'purchase',
          currency_id: [1, 'USD'],
          amount_untaxed: 20,
          amount_total: 22,
          date_order: '2026-01-01 00:00:00',
          date_approve: '2026-01-01 00:00:00',
          date_planned: false,
        },
      ],
      'purchase.order.line': [
        {
          id: 1,
          order_id: [4, 'P00004'],
          product_id: [1, 'P'],
          product_qty: 2,
          qty_received: 2,
          price_unit: 10,
          price_subtotal: 20,
          display_type: false,
        },
      ],
    })
    const po = await new OdooInventoryAdapter().getPurchaseOrder(CREDS, '4')
    PurchaseOrderSchema.parse(po)
    expect(po.status).toBe('received')
    expect(sent[0]!.path).toBe('/json/2/purchase.order/read')
    expect(sent[1]!.body['domain']).toEqual([
      ['order_id', 'in', [4]],
      ['display_type', '=', false],
    ])
  })

  it('talks /jsonrpc execute_kw on Odoo 14–18', async () => {
    const sent = fakeOdoo({ 'product.product': [product(1)] })
    const rows = await new OdooInventoryAdapter().listProducts(RPC_CREDS, { page: 1, limit: 5 })
    expect(rows.map((r) => r.id)).toEqual(['1'])
    expect(sent[0]!.path).toBe('rpc:product.product/search_read')
  })

  it('a record id that is not an Odoo integer id is a 404 before any call', async () => {
    const sent = fakeOdoo({})
    await expect(new OdooInventoryAdapter().getProduct(CREDS, 'abc')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(sent).toEqual([])
  })

  it('a missing product is a 404', async () => {
    fakeOdoo({ 'product.product': [] })
    await expect(new OdooInventoryAdapter().getProduct(CREDS, '99')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('odoo-inventory on Odoo 14–18 (RPC)', () => {
  it('reads stock levels, locations and transfers on Odoo 14.0 field sets', async () => {
    const sent = fakeOdoo({
      'stock.quant': [quant(1, 'internal')],
      'stock.location': [
        { id: 8, name: 'Stock', complete_name: 'WH/Stock', usage: 'internal', active: true },
      ],
      'stock.picking': [picking(1, 'internal')],
      'stock.move': [
        {
          id: 10,
          picking_id: [1, 'WH/INT/1'],
          product_id: [1, 'P'],
          product_uom_qty: 3,
          quantity_done: 2,
        },
      ],
    })
    const a = new OdooInventoryAdapter()
    const levels = await a.listStockLevels(RPC_CREDS, { page: 1, limit: 10 })
    levels.forEach((r) => StockLevelSchema.parse(r))
    await a.getStockLevel(RPC_CREDS, '1')
    const locs = await a.listLocations(RPC_CREDS, { page: 1, limit: 10 })
    locs.forEach((r) => LocationSchema.parse(r))
    await a.getLocation(RPC_CREDS, '8')
    const transfers = await a.listStockTransfers(RPC_CREDS, { page: 1, limit: 10 })
    transfers.forEach((r) => StockTransferSchema.parse(r))
    // 14.0–16.0 keep the done quantity in quantity_done.
    expect(transfers[0]!.lines).toEqual([{ productId: '1', quantity: 3, quantityReceived: 2 }])
    const one = await a.getStockTransfer(RPC_CREDS, '1')
    expect(one.lines).toEqual([{ productId: '1', quantity: 3, quantityReceived: 2 }])
    expect(sent.map((s) => s.path)).toContain('rpc:stock.move/search_read')
  })

  it('JSON-2 (Odoo 19) still reads the warehouse', async () => {
    const sent = fakeOdoo({ 'stock.quant': [quant(1, 'internal')] })
    const [level] = await new OdooInventoryAdapter().listStockLevels(CREDS, { page: 1, limit: 10 })
    expect(level!.metadata).toMatchObject({ warehouseId: '1' })
    expect(sent[0]!.body['fields']).toContain('warehouse_id')
  })
})

describe('odoo-inventory list grouping', () => {
  it('gives each purchase order only its own lines, looked up in id order', async () => {
    const po = (id: number): Row => ({
      id,
      name: `P${id}`,
      partner_id: [14, 'Azure'],
      partner_ref: false,
      state: 'purchase',
      currency_id: [1, 'USD'],
      amount_untaxed: 20,
      amount_total: 20,
      date_order: '2026-01-01 00:00:00',
      date_approve: '2026-01-01 00:00:00',
      date_planned: false,
    })
    const ln = (id: number, order: number, product: number): Row => ({
      id,
      order_id: [order, `P${order}`],
      product_id: [product, 'P'],
      product_qty: 1,
      qty_received: 0,
      price_unit: 10,
      price_subtotal: 10,
      display_type: false,
    })
    const sent = fakeOdoo({
      'purchase.order': [po(1), po(2)],
      'purchase.order.line': [ln(3, 2, 30), ln(1, 1, 10), ln(2, 2, 20)],
    })
    const rows = await new OdooInventoryAdapter().listPurchaseOrders(CREDS, { page: 1, limit: 10 })
    expect(rows.map((r) => r.lines.map((l) => l.productId))).toEqual([['10'], ['20', '30']])
    const lookup = sent.find((s) => s.path === '/json/2/purchase.order.line/search_read')
    expect(lookup!.body['order']).toBe('id asc')
  })

  it('gives each transfer only its own moves, looked up in id order', async () => {
    const mv = (id: number, pick: number, product: number): Row => ({
      id,
      picking_id: [pick, `WH/INT/${pick}`],
      product_id: [product, 'P'],
      product_uom_qty: 1,
      quantity: 0,
    })
    const sent = fakeOdoo({
      'stock.picking': [picking(1, 'internal'), picking(2, 'internal')],
      'stock.move': [mv(3, 2, 30), mv(1, 1, 10), mv(2, 2, 20)],
    })
    const rows = await new OdooInventoryAdapter().listStockTransfers(CREDS, { page: 1, limit: 10 })
    expect(rows.map((r) => r.lines.map((l) => l.productId))).toEqual([['10'], ['20', '30']])
    const lookup = sent.find((s) => s.path === '/json/2/stock.move/search_read')
    expect(lookup!.body['order']).toBe('id asc')
  })
})

describe('odoo-inventory ids and limits', () => {
  it("id '0' names no Odoo record: 404 before any call", async () => {
    const sent = fakeOdoo({ 'product.product': [product(1)] })
    await expect(new OdooInventoryAdapter().getProduct(CREDS, '0')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(sent).toEqual([])
  })

  it('a fractional limit is floored before it is sent', async () => {
    const sent = fakeOdoo({ 'product.product': [product(1), product(2), product(3)] })
    await new OdooInventoryAdapter().listProducts(CREDS, { page: 1, limit: 2.7 })
    expect(sent[0]!.body['limit']).toBe(2)
  })

  it('a limit below 1 is a 400 VALIDATION before any call', async () => {
    const sent = fakeOdoo({ 'product.product': [product(1)] })
    await expect(
      new OdooInventoryAdapter().listProducts(CREDS, { page: 1, limit: 0 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' })
    expect(sent).toEqual([])
  })
})

describe('odoo-inventory paging', () => {
  it('walks products by offset/limit in id order and reports the total', async () => {
    fakeOdoo({ 'product.product': [3, 1, 5, 2, 4].map(product) })
    const a = new OdooInventoryAdapter()
    const seen: string[] = []
    const metas: unknown[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await a.listProducts(CREDS, params)).map((r) => r.id))
      metas.push(readUpstreamPage(params))
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(metas).toEqual([
      { totalCount: 5, hasMore: true },
      { totalCount: 5, hasMore: true },
      { totalCount: 5, hasMore: false },
    ])
  })
})

describe('odoo-inventory refusals', () => {
  it.each(['listSuppliers', 'getSupplier', 'listStockAdjustments', 'getStockAdjustment'] as const)(
    '%s is a 501 with no call made',
    async (method) => {
      const sent = fakeOdoo({})
      const a = new OdooInventoryAdapter()
      await expect(
        (a[method] as (c: unknown, p: unknown) => Promise<unknown>)(
          CREDS,
          method.startsWith('get') ? '1' : { page: 1 },
        ),
      ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(sent).toEqual([])
    },
  )

  it('refuses every webhook, including one carrying a valid X-Odoo-Signature HMAC', () => {
    const body = Buffer.from('{"Type":"Product.Added"}')
    const sig = createHmac('sha256', 'shh').update(body).digest('hex')
    expect(new OdooInventoryAdapter().verifyWebhook(body, { 'x-odoo-signature': sig }, 'shh')).toBe(
      false,
    )
    expect(
      OdooInventoryWebhookHandler.verifyWebhook(body, { 'x-odoo-signature': sig }, 'shh'),
    ).toBe(false)
    expect(OdooInventoryWebhookHandler.parseWebhookEvents({ Type: 'Product.Added' })).toEqual([])
  })

  it('metadata declares the five mapped resources and the two refused', () => {
    expect([...metadata.availableResources].sort()).toEqual([
      'location',
      'product',
      'purchase-order',
      'stock-level',
      'stock-transfer',
    ])
    expect(metadata.unavailableResources.map((r) => r.resource).sort()).toEqual([
      'stock-adjustment',
      'supplier',
    ])
  })
})
