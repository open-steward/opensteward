import { describe, it, expect, vi, afterEach } from 'vitest'
import { ShipBobAdapter } from '../../../../../../src/verticals/logistics/adapters/shipbob/index'
import { ShipBobClient } from '../../../../../../src/verticals/logistics/adapters/shipbob/client'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'
import type { ShipBobOrderShipment } from '../../../../../../src/verticals/logistics/adapters/shipbob/transform/order'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'

/**
 * `listShipments` and `listTrackingEvents` asked ShipBob for orders with
 * `HasTracking: true`, so ShipBob answered with only the orders that already
 * carry a tracking number and both methods returned an empty array for
 * everything else.
 *
 * A shipment exists from the moment ShipBob accepts the order. Tracking
 * numbers appear later, when a label is bought. Filtering on tracking
 * therefore hides every shipment in the window between those two events —
 * which is most of them on a working account, and all of them on one whose
 * orders have not shipped yet.
 *
 * Measured on a live sandbox: 25 orders, 25 shipments, all `Processing`,
 * none with a tracking number. The sync stored 25 orders and 0 shipments,
 * then wrote a `collection_sync` completeness marker over the emptiness, so
 * later unfiltered reads served "0 shipments" as an authoritative answer.
 *
 * These use exactly that shape.
 */

const CREDS: Credentials = { accessToken: 'tok' }

/** An order as the live sandbox returns it: shipment present, no tracking. */
function processingOrder(id: number, shipmentId: number) {
  return {
    id,
    reference_id: `ref-${id}`,
    order_number: `SO-${id}`,
    status: 'Processing',
    created_date: '2026-09-14T08:00:00Z',
    purchase_date: '2026-09-14T08:00:00Z',
    channel: { id: 281033, name: 'sandbox' },
    recipient: null,
    products: null,
    shipments: [
      { id: shipmentId, status: 'Processing', tracking: null, tracking_number: null },
    ] as ShipBobOrderShipment[],
    financials: null,
    shipping_method: 'Standard',
    gift_message: null,
    tags: null,
    type: 'DTC',
  }
}

/** The shipment detail route's answer for one of those. */
function processingShipmentDetail(id: number, orderId: number) {
  return {
    id,
    order_id: orderId,
    status: 'Processing',
    created_date: '2026-09-14T08:00:00Z',
    tracking: null,
    tracking_number: null,
    tracking_url: null,
    carrier: null,
    carrier_service: null,
    location: { id: 8, name: 'Cicero (IL)' },
    recipient: null,
  }
}

/**
 * Route the two shapes `listShipments` fetches: the order collection, then
 * one detail call per shipment.
 *
 * The order collection HONOURS `HasTracking` the way ShipBob does — server
 * side, before answering. A stub that ignored it would return the orders
 * either way, and every assertion below would pass against the filtered code
 * too, pinning nothing.
 */
function stubOrders(orders: ReturnType<typeof processingOrder>[]) {
  return vi
    .spyOn(ShipBobClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path === 'order') {
        if (params?.HasTracking !== true) return orders as never
        return orders.filter((o) =>
          (o.shipments ?? []).some((s) => s.tracking?.tracking_number ?? s.tracking_number),
        ) as never
      }
      const m = path.match(/^order\/(\d+)\/shipment\/(\d+)$/)
      if (m) return processingShipmentDetail(Number(m[2]), Number(m[1])) as never
      throw new Error(`unexpected path ${path}`)
    })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shipbob listShipments', () => {
  it('returns shipments that have no tracking number yet', async () => {
    stubOrders([processingOrder(1001, 5001), processingOrder(1002, 5002)])
    const out = await new ShipBobAdapter().listShipments(CREDS, {})
    expect(out.map((s) => s.id)).toEqual(['5001', '5002'])
    for (const s of out) expect(() => ShipmentSchema.parse(s)).not.toThrow()
  })

  it('does not narrow the order query to tracked orders', async () => {
    const get = stubOrders([processingOrder(1001, 5001)])
    await new ShipBobAdapter().listShipments(CREDS, {})
    const params = get.mock.calls.find((c) => c[0] === 'order')?.[1]
    expect(params).not.toHaveProperty('HasTracking')
  })

  it('still forwards paging to the order query', async () => {
    const get = stubOrders([processingOrder(1001, 5001)])
    await new ShipBobAdapter().listShipments(CREDS, { page: 3, limit: 10 })
    const params = get.mock.calls.find((c) => c[0] === 'order')?.[1]
    expect(params).toMatchObject({ Page: 3, Limit: 10 })
  })
})

describe('shipbob listTrackingEvents', () => {
  it('emits an event for a shipment that has no tracking number yet', async () => {
    stubOrders([processingOrder(1001, 5001)])
    const out = await new ShipBobAdapter().listTrackingEvents(CREDS, {})
    expect(out).toHaveLength(1)
    // `Processing` is a real, reportable state — the absence of a tracking
    // number is not the absence of an event.
    expect(out[0]).toMatchObject({ id: '5001', status: 'IN_TRANSIT', trackingNumber: undefined })
    expect(() => TrackingEventSchema.parse(out[0])).not.toThrow()
  })

  it('does not narrow the order query to tracked orders', async () => {
    const get = stubOrders([processingOrder(1001, 5001)])
    await new ShipBobAdapter().listTrackingEvents(CREDS, {})
    const params = get.mock.calls.find((c) => c[0] === 'order')?.[1]
    expect(params).not.toHaveProperty('HasTracking')
  })
})

describe('shipbob getTrackingEvents', () => {
  it('still narrows to tracked orders when searching by tracking number', async () => {
    // Unchanged on purpose: this one looks up a specific tracking number, so
    // an order without one cannot match and fetching it would be waste.
    const get = stubOrders([processingOrder(1001, 5001)])
    await new ShipBobAdapter().getTrackingEvents(CREDS, 'TBA334553295083')
    const params = get.mock.calls.find((c) => c[0] === 'order')?.[1]
    expect(params).toMatchObject({ HasTracking: true })
  })
})
