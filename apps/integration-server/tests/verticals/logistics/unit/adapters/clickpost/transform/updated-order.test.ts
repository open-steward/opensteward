import { describe, it, expect } from 'vitest'
import {
  mapClickPostStatusCode,
  transformUpdatedOrder,
  type ClickPostUpdatedOrder,
} from '../../../../../../../src/verticals/logistics/adapters/clickpost/transform/updated-order'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

/**
 * The first row of the documented 200 example of GET /api/v1/updated-order
 * (https://docs.clickpost.ai/reference/fetch-updated-orders-list).
 */
const DOC_UPDATED_ORDER: ClickPostUpdatedOrder = {
  waybill: '19025310019401',
  courier_partner: 4,
  created_at: '2022-10-19T12:28:24.921389Z',
  updated_at: '2022-11-02T00:39:01.647051Z',
  clickpost_status_code: 21,
  timestamp: '2022-11-01 19:58:10',
  clickpost_status_description: 'RTO-InTransit',
  reference_number: '636134594433',
  account_code: 'Delhivery_Express_B2C',
  location: 'Mumbai_Chandivali_R (Maharashtra)',
  remark: 'Added to Bag',
  status: 'Pending',
  customer_feedback_present: false,
  clickpost_city: '',
}

describe('clickpost transformUpdatedOrder', () => {
  it('maps the documented row onto a Shipment', () => {
    const s = ShipmentSchema.parse(transformUpdatedOrder(DOC_UPDATED_ORDER))
    expect(s).toMatchObject({
      id: '636134594433',
      reference: '636134594433',
      trackingNumber: '19025310019401',
      carrierId: '4',
      serviceCode: 'Delhivery_Express_B2C',
      status: 'RETURNED',
    })
    expect(s.createdAt?.toISOString()).toBe('2022-10-19T12:28:24.921Z')
    expect(s.updatedAt?.toISOString()).toBe('2022-11-02T00:39:01.647Z')
    expect(s.metadata?.['timestamp']).toBe('2022-11-01 19:58:10')
  })

  it('omits absent fields instead of inventing them', () => {
    const s = ShipmentSchema.parse(transformUpdatedOrder({}))
    expect(s.id).toBeUndefined()
    expect(s.trackingNumber).toBeUndefined()
    expect(s.carrierId).toBeUndefined()
    expect(s.createdAt).toBeUndefined()
    expect(s.status).toBe('UNKNOWN')
  })

  // Every row of https://docs.clickpost.ai/docs/tracking-status-codes that is
  // mapped, then a sample of documented codes left UNKNOWN (0 NoStatusExist,
  // 23 Expired, 30 Exchange Pickup, 40 RiderAllocationAwaited, 101 RETURN
  // REQUEST PLACED) and one undocumented code.
  it.each([
    [1, 'LABEL_CREATED'], // OrderPlaced
    [2, 'LABEL_CREATED'], // PickupPending
    [3, 'EXCEPTION'], // PickupFailed
    [4, 'IN_TRANSIT'], // PickedUp
    [5, 'IN_TRANSIT'], // InTransit
    [6, 'OUT_FOR_DELIVERY'], // OutForDelivery
    [7, 'EXCEPTION'], // NotServiceable
    [8, 'DELIVERED'], // Delivered
    [9, 'EXCEPTION'], // FailedDelivery
    [10, 'CANCELLED'], // Cancelled
    [11, 'RETURNED'], // RTO-Requested
    [12, 'RETURNED'], // RTO-Marked
    [13, 'RETURNED'], // RTO-OutForDelivery
    [14, 'RETURNED'], // RTO-Delivered
    [15, 'EXCEPTION'], // RTO-Failed
    [16, 'EXCEPTION'], // Lost
    [17, 'EXCEPTION'], // Damaged
    [18, 'EXCEPTION'], // ShipmentDelayed
    [19, 'EXCEPTION'], // ContactCustomerCare
    [20, 'EXCEPTION'], // ShipmentHeld
    [21, 'RETURNED'], // RTO-InTransit
    [25, 'LABEL_CREATED'], // OutForPickup
    [26, 'RETURNED'], // RTO-ContactCustomerCare
    [27, 'RETURNED'], // RTO-ShipmentDelay
    [28, 'LABEL_CREATED'], // Awb Registered
    [1004, 'IN_TRANSIT'], // DestinationHubIn
    [1005, 'IN_TRANSIT'], // OriginCityIn
    [1006, 'IN_TRANSIT'], // OriginCityOut
    [0, 'UNKNOWN'],
    [23, 'UNKNOWN'],
    [30, 'UNKNOWN'],
    [40, 'UNKNOWN'],
    [101, 'UNKNOWN'],
    [999, 'UNKNOWN'],
  ] as const)('maps clickpost_status_code %i to %s', (code, status) => {
    expect(mapClickPostStatusCode(code)).toBe(status)
    expect(
      ShipmentSchema.parse(transformUpdatedOrder({ clickpost_status_code: code })).status,
    ).toBe(status)
  })
})
