/**
 * CDEK has no order list. listShipments, listOrders and listTrackingEvents
 * called GET /v2/orders with `size` / `date_from`, which CDEK's own OpenAPI
 * document (https://gateway.cdek.ru/api-cdek-docs/web/docs/merged?sectionId=api_v2_integration)
 * defines as a single-order lookup:
 *   GET /v2/orders — "Получение информации о заказе по номеру СДЭК/ИМ",
 *   parameters: cdek_number, im_number (nothing else).
 * No other GET in that document enumerates orders, so the three lists refuse
 * with 501 before any request is sent. The per-id reads stay:
 *   GET /v2/orders/{uuid} — "Получение информации о заказе по UUID".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { CdekAdapter } from '../../../../../../src/verticals/logistics/adapters/cdek/index'

const CREDS = { accessToken: 'cdek_test_token' }

function fakeHttp() {
  const http = {
    get: vi.fn(async () => ({ data: {}, headers: {} })),
    post: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  }
  const create = vi.spyOn(axios, 'create').mockImplementation((() => http) as never)
  return { http, create }
}

afterEach(() => vi.restoreAllMocks())

const PARAMS = [
  { page: 1, limit: 20 },
  { page: 2, limit: 5, updatedAfter: new Date('2026-09-01T00:00:00Z') },
]

describe.each([
  ['listShipments', 'shipments'],
  ['listOrders', 'orders'],
  ['listTrackingEvents', 'tracking events'],
] as const)('cdek %s', (method, noun) => {
  it.each(PARAMS)('throws 501 NOT_SUPPORTED and sends no request (%o)', async (p) => {
    const { http, create } = fakeHttp()
    const call = new CdekAdapter()[method](CREDS, withPageSink({ ...p }))
    await expect(call).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining(`CDEK cannot list ${noun}`),
    })
    expect(http.get).not.toHaveBeenCalled()
    expect(http.post).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('cdek per-id reads stay on the documented lookups', () => {
  const ORDER = {
    entity: {
      uuid: '72753031-e66b-4146-ab8c-52179ef4020a',
      cdek_number: '1106207236',
      tariff_code: 139,
    },
  }

  it('getShipment reads GET /orders/{uuid}', async () => {
    const { http } = fakeHttp()
    http.get.mockResolvedValue({ data: ORDER, headers: {} })
    const s = await new CdekAdapter().getShipment(CREDS, ORDER.entity.uuid)
    expect(http.get).toHaveBeenCalledWith(`/orders/${ORDER.entity.uuid}`, { params: undefined })
    expect(s.id).toBe(ORDER.entity.uuid)
  })

  it('getOrder reads GET /orders/{uuid}', async () => {
    const { http } = fakeHttp()
    http.get.mockResolvedValue({ data: ORDER, headers: {} })
    const o = await new CdekAdapter().getOrder(CREDS, ORDER.entity.uuid)
    expect(http.get).toHaveBeenCalledWith(`/orders/${ORDER.entity.uuid}`, { params: undefined })
    expect(o.id).toBe(ORDER.entity.uuid)
  })

  it('getTrackingEvents looks the order up by its documented cdek_number only', async () => {
    const { http } = fakeHttp()
    http.get.mockResolvedValue({ data: ORDER, headers: {} })
    await new CdekAdapter().getTrackingEvents(CREDS, '1106207236')
    expect(http.get).toHaveBeenCalledWith('/orders', { params: { cdek_number: '1106207236' } })
  })
})
