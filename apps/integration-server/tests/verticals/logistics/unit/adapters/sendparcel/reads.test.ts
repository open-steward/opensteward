/**
 * Read methods of the SendParcel adapter, against the OpenAPI spec embedded in
 * https://api.sendparcel.com/rest-api/doc (<script id="swagger-data">):
 * - servers: `{"url":"https://api.sendparcel.com","description":"API production server"}`
 * - every /rest-api/ operation: `"parameters":[{"name":"password","in":"header"}]`
 * - /rest-api/ paths: orders/creates, orders/infos, orders/cancels,
 *   orders/documents, returns/postboxes, quotes, services, tracks. No shipments,
 *   orders, tracking or labels collection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const posts: Array<{
  baseURL: string
  headers: Record<string, string>
  path: string
  body: unknown
}> = []
const routes = new Map<string, (body: unknown) => unknown>()

vi.mock('axios', () => {
  const create = (config: { baseURL: string; headers: Record<string, string> }) => ({
    post: async (path: string, body: unknown) => {
      posts.push({ baseURL: config.baseURL, headers: config.headers, path, body })
      const route = routes.get(path)
      if (!route)
        throw Object.assign(new Error(`undocumented path ${path}`), { response: { status: 404 } })
      return { data: route(body) }
    },
    get: async (path: string) => {
      posts.push({ baseURL: config.baseURL, headers: config.headers, path, body: undefined })
      throw new Error(`no documented GET at ${path}`)
    },
  })
  return { default: { create }, create }
})

import { SendParcelAdapter } from '../../../../../../src/verticals/logistics/adapters/sendparcel/index'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { LabelSchema } from '../../../../../../src/verticals/logistics/schema/label'

const creds = { accessToken: 'sp-token' }
const adapter = new SendParcelAdapter()

beforeEach(() => {
  posts.length = 0
  routes.clear()
})

describe('sendparcel refused reads', () => {
  it.each([
    [
      'listShipments',
      () => adapter.listShipments(creds, { page: 1, limit: 10 }),
      /cannot list shipments/,
    ],
    ['getShipment', () => adapter.getShipment(creds, '1'), /cannot read a shipment/],
    ['listOrders', () => adapter.listOrders(creds, { page: 1, limit: 10 }), /cannot list orders/],
    [
      'listTrackingEvents',
      () => adapter.listTrackingEvents(creds, { page: 1, limit: 10 }),
      /cannot list tracking events/,
    ],
    [
      'getTrackingEvents',
      () => adapter.getTrackingEvents(creds, 'JD0002231234567890'),
      /cannot look up tracking by tracking number/,
    ],
    ['listLabels', () => adapter.listLabels(creds, { page: 1, limit: 10 }), /cannot list labels/],
  ] as const)('%s throws 501 NOT_SUPPORTED and sends nothing', async (_name, call, message) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED', message })
    expect(posts).toEqual([])
  })
})

describe('sendparcel getOrder', () => {
  it('posts orderInfo.id as an integer with the password header to the production host', async () => {
    routes.set('orders/infos', (body) => {
      const id = (body as { orderInfo: { id: number } }).orderInfo.id
      return {
        id: String(id),
        status: 1,
        tracking_number: 'JD0002231234567890',
        created_date: '2026-03-01 10:15:00',
        recipient: { name: 'Anna Berzina', city: 'Riga', country: 'LV' },
        parcels: [{ weight: 1 }],
      }
    })
    const order = OrderSchema.parse(await adapter.getOrder(creds, '123456'))
    expect(posts).toHaveLength(1)
    expect(posts[0]!.baseURL).toBe('https://api.sendparcel.com/rest-api/')
    expect(posts[0]!.headers.password).toBe('sp-token')
    expect(posts[0]!.headers.Authorization).toBeUndefined()
    expect(posts[0]!.path).toBe('orders/infos')
    expect(posts[0]!.body).toEqual({ orderInfo: { id: 123456 } })
    expect(order.id).toBe('123456')
    expect(order.status).toBe('PENDING')
    expect(order.destinationAddress).toEqual({ name: 'Anna Berzina', city: 'Riga', country: 'LV' })
  })

  it('refuses a non-integer id before sending anything', async () => {
    await expect(adapter.getOrder(creds, 'ord_1')).rejects.toMatchObject({ statusCode: 400 })
    expect(posts).toEqual([])
  })

  it('refuses an id beyond the safe-integer range instead of rounding it to another order', async () => {
    await expect(adapter.getOrder(creds, '9007199254740993')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(posts).toEqual([])
  })
})

describe('sendparcel getLabel', () => {
  it('posts orderFiles.id and returns the single document as a base64 label', async () => {
    routes.set('orders/documents', () => [
      { file_name: 'label_42.pdf', ftype: 'pdf', file_data: 'JVBERi0xLjQK' },
    ])
    const label = LabelSchema.parse(await adapter.getLabel(creds, '42'))
    expect(posts).toHaveLength(1)
    expect(posts[0]!.headers.password).toBe('sp-token')
    expect(posts[0]!.path).toBe('orders/documents')
    expect(posts[0]!.body).toEqual({ orderFiles: { id: 42 } })
    expect(label).toMatchObject({ id: '42', format: 'PDF', base64: 'JVBERi0xLjQK' })
  })

  it('refuses an order with several documents instead of dropping all but one', async () => {
    routes.set('orders/documents', () => [
      { file_name: 'a.pdf', ftype: 'pdf', file_data: 'QQ==' },
      { file_name: 'b.pdf', ftype: 'pdf', file_data: 'Qg==' },
    ])
    await expect(adapter.getLabel(creds, '42')).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/2 documents.*a\.pdf, b\.pdf/),
    })
  })

  it('reports an empty document list as not found', async () => {
    routes.set('orders/documents', () => [])
    await expect(adapter.getLabel(creds, '42')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses a non-integer id before sending anything', async () => {
    await expect(adapter.getLabel(creds, 'lbl_1')).rejects.toMatchObject({ statusCode: 400 })
    expect(posts).toEqual([])
  })

  it('refuses an id beyond the safe-integer range before sending anything', async () => {
    await expect(adapter.getLabel(creds, '9007199254740993')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(posts).toEqual([])
  })
})
