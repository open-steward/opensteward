/**
 * Routific order transform, pinned to the documented "Fetch order" response.
 *
 * Fixture: the "Sample Response Payload" of
 * https://api-docs.routific.com/reference/fetch-order.md (GET
 * https://api.plan.routific.com/v2/orders/{orderUuid}), with the invalid
 * trailing comma in its customFields removed and the signature string cut.
 * Status enum, verbatim: "Possible values: not\_scheduled, scheduled,
 * delivered, missed."
 */
import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/routific/transform/order'
import { documentedOrder } from '../fixtures'

describe('Routific transformOrder (documented Fetch order payload)', () => {
  it('parses against OrderSchema and maps the documented fields', () => {
    const out = OrderSchema.parse(transformOrder(documentedOrder()))
    expect(out.id).toBe('9a3e5d87-a448-4125-a165-2b8a689322ab')
    expect(out.orderNumber).toBe('ORD-1655')
    expect(out.notes).toBe('Deliver at loading bay at the back of the building.')
    expect(out.createdAt?.toISOString()).toBe('2023-06-13T23:50:54.758Z')
    expect(out.destinationAddress).toEqual({
      name: 'Metro',
      street1: '510 W 8th Ave, Vancouver, BC V5Z 1C5, Canada',
      phone: '16043215582',
      email: 'metro@routific.com',
    })
  })

  it('does not guess a country from the free-text address', () => {
    const out = OrderSchema.parse(transformOrder(documentedOrder()))
    expect(out.destinationAddress?.country).toBeUndefined()
  })

  it('maps each documented status value', () => {
    const status = (s: string) =>
      OrderSchema.parse(transformOrder(documentedOrder({ status: s }))).status
    expect(status('not_scheduled')).toBe('PENDING')
    expect(status('scheduled')).toBe('AWAITING_SHIPMENT')
    expect(status('delivered')).toBe('DELIVERED')
    // A missed delivery is not a return, and the vendor names no reason code
    // that would make it one.
    expect(status('missed')).toBe('unknown')
  })

  it('maps an undocumented status to unknown, not to PENDING', () => {
    expect(OrderSchema.parse(transformOrder(documentedOrder({ status: 'weird' }))).status).toBe(
      'unknown',
    )
  })

  it('matches the documented lowercase status values exactly (no case folding)', () => {
    // The docs list only lowercase values; an upper-case variant is undocumented.
    expect(OrderSchema.parse(transformOrder(documentedOrder({ status: 'DELIVERED' }))).status).toBe(
      'unknown',
    )
  })

  it('sets deliveredAt from deliveryTime only for delivered orders', () => {
    expect(OrderSchema.parse(transformOrder(documentedOrder())).deliveredAt).toBeUndefined()
    const delivered = OrderSchema.parse(transformOrder(documentedOrder({ status: 'delivered' })))
    expect(delivered.deliveredAt?.toISOString()).toBe('2023-06-14T23:50:54.758Z')
  })

  it('does not use customerOrderNumber as a fallback order number', () => {
    const out = OrderSchema.parse(
      transformOrder(documentedOrder({ routificOrderNumber: undefined })),
    )
    expect(out.orderNumber).toBeUndefined()
  })

  it('omits the address when the order has no locations', () => {
    const out = OrderSchema.parse(
      transformOrder(
        documentedOrder({ locations: [], name: undefined, phone: undefined, email: undefined }),
      ),
    )
    expect(out.destinationAddress).toBeUndefined()
  })

  it('keeps the raw payload (tracking link, proof of delivery) in metadata', () => {
    const raw = documentedOrder()
    const out = OrderSchema.parse(transformOrder(raw))
    expect(out.metadata?.deliveryTracking).toEqual(raw.deliveryTracking)
  })

  it('throws on a payload without the documented uuid', () => {
    expect(() => transformOrder(documentedOrder({ uuid: undefined as unknown as string }))).toThrow(
      /uuid/,
    )
  })
})
