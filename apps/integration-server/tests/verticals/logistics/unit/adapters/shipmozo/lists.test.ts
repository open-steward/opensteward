/**
 * Shipmozo read methods, against a fake that honours only documented
 * parameters. Sources: the OpenAPI spec behind the panel's Swagger link
 * (https://shipping-api.com/api/v1?api-docs-v1.json, servers
 * "https://shipping-api.com/app/api/v1") and the API documentation PDF linked
 * from the same dialog. Every call carries the "public-key" and "private-key"
 * headers ("Api Public Key", "Api Private Key").
 *
 * - listWarehouses: GET /get-warehouses, "page ... If you have more than 25
 *   records, pass page number (For next 25 records)". No size parameter.
 * - getShipment: GET /track-order?awb_number=.
 * - getLabel: GET /get-order-label/{awb_number}.
 * - listShipments, getOrder, getTrackingEvents: refused (see adapter).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { ShipMozoAdapter } from '../../../../../../src/verticals/logistics/adapters/shipmozo/index'
import { WarehouseSchema } from '../../../../../../src/verticals/logistics/schema/warehouse'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { LabelSchema } from '../../../../../../src/verticals/logistics/schema/label'
import { docLabelRow, docTrackData, docWarehouseRow } from './fixtures'

type Params = Record<string, unknown> | undefined
type Handler = (path: string, params: Params) => unknown
type Call = { path: string; params: Params }

let handler: Handler
let calls: Call[]
let configs: Array<{ baseURL?: unknown; headers?: Record<string, unknown> }>
let credSeq = 0

function freshCreds() {
  // A fresh key per test: pager keys are per connection.
  credSeq += 1
  return { accessToken: `pub-${credSeq}-${Math.random()}`, extra: { privateKey: 'priv' } }
}

beforeEach(() => {
  calls = []
  configs = []
  handler = () => {
    throw new Error('unexpected request')
  }
  vi.spyOn(axios, 'create').mockImplementation((cfg) => {
    configs.push({
      baseURL: cfg?.baseURL,
      headers: cfg?.headers as Record<string, unknown> | undefined,
    })
    return {
      get: vi.fn(async (path: string, opts?: { params?: Params }) => {
        calls.push({ path, params: opts?.params })
        return { data: handler(path, opts?.params) }
      }),
      post: vi.fn(async () => {
        throw new Error('no POST is expected from a read method')
      }),
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Rejects any query parameter the endpoint does not document. */
function documented(params: Params, allowed: string[]): Record<string, unknown> {
  const p = params ?? {}
  for (const k of Object.keys(p)) {
    if (p[k] === undefined) continue
    if (!allowed.includes(k)) throw new Error(`undocumented ${k}`)
  }
  return p
}

function warehouse(i: number) {
  return { ...docWarehouseRow(), id: 1000 + i, address_title: `WH ${i}` }
}

/** GET /get-warehouses over `rows`, 25 per page, `page` optional and 1-based. */
function warehousesFake(rows: ReturnType<typeof warehouse>[]): Handler {
  return (path, params) => {
    if (path !== '/get-warehouses') throw new Error(`unexpected path ${path}`)
    const p = documented(params, ['page'])
    const page = p['page'] === undefined ? 1 : Number(p['page'])
    if (!Number.isInteger(page) || page < 1) throw new Error(`bad page ${String(p['page'])}`)
    return { result: '1', message: 'Success', data: rows.slice((page - 1) * 25, page * 25) }
  }
}

async function walk(total: number, limit: number) {
  const rows = Array.from({ length: total }, (_, i) => warehouse(i))
  handler = warehousesFake(rows)
  const creds = freshCreds()
  const adapter = new ShipMozoAdapter()
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (let page = 1; page <= Math.ceil(total / limit) + 1; page++) {
    const params = withPageSink({ page, limit })
    const got = await adapter.listWarehouses(creds, params)
    for (const w of got) WarehouseSchema.parse(w)
    seen.push(...got.map((w) => w.id!))
    more.push(readUpstreamPage(params)?.hasMore)
    if (readUpstreamPage(params)?.hasMore === false) break
  }
  return { rows, seen, more }
}

describe('shipmozo client', () => {
  it('sends the documented base URL and the public-key/private-key headers', async () => {
    handler = warehousesFake([warehouse(0)])
    await new ShipMozoAdapter().listWarehouses(
      { accessToken: 'PUB', extra: { privateKey: 'PRIV' } },
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(configs[0]!.baseURL).toBe('https://shipping-api.com/app/api/v1')
    expect(configs[0]!.headers?.['public-key']).toBe('PUB')
    expect(configs[0]!.headers?.['private-key']).toBe('PRIV')
    expect(configs[0]!.headers?.['Authorization']).toBeUndefined()
  })

  it('refuses a connection without the private key before sending anything', async () => {
    handler = warehousesFake([warehouse(0)])
    await expect(
      new ShipMozoAdapter().listWarehouses(
        { accessToken: 'PUB' },
        withPageSink({ page: 1, limit: 10 }),
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'CREDENTIALS_INCOMPLETE' })
    expect(calls).toEqual([])
  })

  it('throws on result "0" instead of reading it as an empty list', async () => {
    handler = () => ({ result: '0', message: 'unauthorised request', data: [] })
    await expect(
      new ShipMozoAdapter().listWarehouses(freshCreds(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/unauthorised request/)
  })

  it('stores the two documented keys from the credential form', async () => {
    const a = new ShipMozoAdapter()
    expect(a.credentialFields().map((f) => f.name)).toEqual(['publicKey', 'privateKey'])
    await expect(a.exchangeCredentials({ publicKey: ' P ', privateKey: ' S ' })).resolves.toEqual({
      accessToken: 'P',
      extra: { privateKey: 'S' },
    })
    await expect(a.exchangeCredentials({ publicKey: 'P' })).rejects.toThrow(/Private key/)
  })
})

describe('shipmozo listWarehouses', () => {
  it('asks for the first page without page, then page 2 for the next 25', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => warehouse(i))
    handler = warehousesFake(rows)
    const creds = freshCreds()
    const a = new ShipMozoAdapter()
    await a.listWarehouses(creds, withPageSink({ page: 1, limit: 30 }))
    expect(calls.map((c) => c.params?.['page'])).toEqual([undefined, 2])
  })

  it('walks 2L+1 rows over uneven upstream pages: every id once, hasMore exact', async () => {
    // L = 20 against upstream pages of 25: 41 rows arrive as 25 + 16.
    const { rows, seen, more } = await walk(41, 20)
    expect(seen).toEqual(rows.map((r) => String(r.id)))
    expect(new Set(seen).size).toBe(41)
    expect(more).toEqual([true, true, false])
  })

  it('walks with a limit above the upstream page size', async () => {
    const { rows, seen, more } = await walk(61, 30)
    expect(seen).toEqual(rows.map((r) => String(r.id)))
    expect(more).toEqual([true, true, false])
  })

  it('ends exactly when the last upstream page is full', async () => {
    const { rows, seen, more } = await walk(50, 25)
    expect(seen).toEqual(rows.map((r) => String(r.id)))
    expect(more).toEqual([true, false])
  })

  it('ends on a page shorter than the fixed 25 rows without asking for another', async () => {
    // 22 rows: short of 25, so page 1 is the last. A smaller assumed page
    // size (e.g. 20) would read 22 as full and ask for page 2.
    const rows = Array.from({ length: 22 }, (_, i) => warehouse(i))
    handler = warehousesFake(rows)
    const params = withPageSink({ page: 1, limit: 50 })
    const got = await new ShipMozoAdapter().listWarehouses(freshCreds(), params)
    expect(got).toHaveLength(22)
    expect(calls).toHaveLength(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('throws 502 on a result "1" body whose data is not an array', async () => {
    handler = () => ({ result: '1', message: 'Success', data: { warehouses: [] } })
    await expect(
      new ShipMozoAdapter().listWarehouses(freshCreds(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' })
  })

  it('reports an empty account as complete', async () => {
    handler = warehousesFake([])
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await new ShipMozoAdapter().listWarehouses(freshCreds(), params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('shipmozo listShipments', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(
      new ShipMozoAdapter().listShipments(freshCreds(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
    expect(configs).toEqual([])
  })
})

describe('shipmozo getShipment', () => {
  it('reads GET /track-order with awb_number only', async () => {
    handler = (path, params) => {
      if (path !== '/track-order') throw new Error(`unexpected path ${path}`)
      const p = documented(params, ['awb_number'])
      if (p['awb_number'] !== 'GGN9000181640') throw new Error('awb_number is required')
      return { result: '1', message: 'Success', data: docTrackData() }
    }
    const s = ShipmentSchema.parse(
      await new ShipMozoAdapter().getShipment(freshCreds(), 'GGN9000181640'),
    )
    expect(s.id).toBe('GGN9000181640')
    expect(s.status).toBe('PENDING')
    expect(calls).toHaveLength(1)
  })

  it('answers 404 when result "1" carries no data', async () => {
    handler = () => ({ result: '1', message: 'Success', data: null })
    await expect(new ShipMozoAdapter().getShipment(freshCreds(), 'X')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })
})

describe('shipmozo getLabel', () => {
  it('reads GET /get-order-label/{awb_number} with no undocumented-format parameter', async () => {
    handler = (path, params) => {
      if (path !== '/get-order-label/GGN%2F1') throw new Error(`unexpected path ${path}`)
      documented(params, [])
      return { result: '1', message: 'Success', data: [docLabelRow()] }
    }
    const l = LabelSchema.parse(await new ShipMozoAdapter().getLabel(freshCreds(), 'GGN/1'))
    expect(l.id).toBe('GGN/1')
    expect(l.format).toBe('PNG')
    expect(l.base64).toBe('iVBORw0KGgoAAAANSUhEUgAA...')
  })

  it('answers 404 when data holds no label', async () => {
    handler = () => ({ result: '1', message: 'Success', data: [] })
    await expect(new ShipMozoAdapter().getLabel(freshCreds(), 'X')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('shipmozo refused reads', () => {
  it('getOrder refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(new ShipMozoAdapter().getOrder(freshCreds(), 'ord-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })

  it('getTrackingEvents refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(
      new ShipMozoAdapter().getTrackingEvents(freshCreds(), 'GGN9000181640'),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
  })
})
