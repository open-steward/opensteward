/**
 * Warp listShipments and listOrders refuse before sending anything.
 *
 * Warp's OpenAPI (https://www.wearewarp.com/api/v1/openapi.json, fetched
 * 2026-09-24) documents one booking collection, GET /bookings, "List recent
 * bookings, newest first", whose only parameter is
 *   { "name": "limit", "in": "query", "required": false,
 *     "schema": { "type": "integer", "default": 25, "maximum": 100 } }
 * No page, offset, cursor or date filter exists anywhere in the spec, so
 * bookings older than the 100 most recent cannot be reached. Serving that
 * capped window as a list would tell the sync the collection is complete.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { WarpAdapter } from '../../../../../../src/verticals/logistics/adapters/warp/index'
import type { QueryParams } from '../../../../../../src/verticals/logistics/adapter/interface'

const creds = { accessToken: 'wak_test_abc' }

let get: ReturnType<typeof vi.fn>
let post: ReturnType<typeof vi.fn>
let del: ReturnType<typeof vi.fn>
let create: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  get = vi.fn(async () => ({ data: { bookings: [], count: 0, limit: 25 } }))
  post = vi.fn(async () => ({ data: {} }))
  del = vi.fn(async () => ({ data: {} }))
  create = vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post,
    delete: del,
    defaults: { headers: { common: {} } },
  } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function refusal(
  run: () => Promise<unknown>,
): Promise<Error & { statusCode?: number; code?: string }> {
  return run().then(
    () => {
      throw new Error('expected a refusal')
    },
    (err: unknown) => err as Error & { statusCode?: number; code?: string },
  )
}

function expectNothingSent(): void {
  expect(get).not.toHaveBeenCalled()
  expect(post).not.toHaveBeenCalled()
  expect(del).not.toHaveBeenCalled()
}

describe('WarpAdapter capped-window lists', () => {
  const adapter = new WarpAdapter()

  it('listShipments refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const err = await refusal(() => adapter.listShipments(creds, { page: 1, limit: 25 }))
    expect(err.statusCode).toBe(501)
    expect(err.code).toBe('NOT_SUPPORTED')
    expect(err.message).toMatch(/^Warp cannot list shipments: /)
    expect(err.message).toContain('"maximum": 100')
    expectNothingSent()
    expect(create).not.toHaveBeenCalled()
  })

  it('listShipments refuses on later pages and with updatedAfter too', async () => {
    const calls: QueryParams[] = [
      { page: 2, limit: 100 },
      { page: 1, limit: 500, updatedAfter: new Date('2026-09-01T00:00:00Z') },
    ]
    for (const params of calls) {
      const err = await refusal(() => adapter.listShipments(creds, params))
      expect(err.statusCode).toBe(501)
      expect(err.code).toBe('NOT_SUPPORTED')
    }
    expectNothingSent()
  })

  it('listOrders refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const err = await refusal(() => adapter.listOrders(creds, { page: 1, limit: 25 }))
    expect(err.statusCode).toBe(501)
    expect(err.code).toBe('NOT_SUPPORTED')
    expect(err.message).toMatch(/^Warp cannot list orders: /)
    expect(err.message).toContain('"maximum": 100')
    expectNothingSent()
    expect(create).not.toHaveBeenCalled()
  })

  it('listOrders refuses on later pages too', async () => {
    const err = await refusal(() => adapter.listOrders(creds, { page: 3, limit: 10 }))
    expect(err.statusCode).toBe(501)
    expect(err.code).toBe('NOT_SUPPORTED')
    expectNothingSent()
  })

  it('getShipment still reads the documented GET /track?booking_id', async () => {
    get.mockResolvedValueOnce({
      data: { shipment_id: '01KTB3PKPGW7DRHM0MP0PCQAXY', status: 'booked' },
    })
    await adapter.getShipment(creds, '01KTB3PKPGW7DRHM0MP0PCQAXY').catch(() => undefined)
    expect(get).toHaveBeenCalledWith('/track', {
      params: { booking_id: '01KTB3PKPGW7DRHM0MP0PCQAXY' },
    })
  })

  it('getOrder still reads the documented GET /track?booking_id', async () => {
    get.mockResolvedValueOnce({
      data: { shipment_id: '01KTB3PKPGW7DRHM0MP0PCQAXY', status: 'booked' },
    })
    await adapter.getOrder(creds, '01KTB3PKPGW7DRHM0MP0PCQAXY').catch(() => undefined)
    expect(get).toHaveBeenCalledWith('/track', {
      params: { booking_id: '01KTB3PKPGW7DRHM0MP0PCQAXY' },
    })
  })
})
