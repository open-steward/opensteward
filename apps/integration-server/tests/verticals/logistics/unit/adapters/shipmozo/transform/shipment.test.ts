/**
 * Track-Order API (Shipmozo API documentation PDF): GET /track-order?awb_number=,
 * "This API is used to track the status of an order using the provided AWB
 * (Air Waybill) number." Example data: order_id, reference_id, awb_number,
 * courier, expected_delivery_date, current_status ("Pickup Pending"),
 * status_time, scan_detail.
 */
import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/shipmozo/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { docTrackData } from '../fixtures'

describe('shipmozo transformShipment', () => {
  it('maps the documented example and parses as a Shipment', () => {
    const raw = docTrackData()
    const s = ShipmentSchema.parse(transformShipment(raw))
    expect(s).toEqual({
      id: 'GGN9000181640',
      trackingNumber: 'GGN9000181640',
      reference: '12634WP61391513073',
      status: 'PENDING',
      metadata: raw,
    })
  })

  it('reads reference from order_id (the merchant order id), not reference_id', () => {
    // Push-Order: order_id "Unique order identifier."; "The order_id must
    // match the one created on your website." The example gives both fields
    // one value, so they are pulled apart here.
    const s = transformShipment({ ...docTrackData(), order_id: 'ORD-1', reference_id: 'REF-9' })
    expect(s.reference).toBe('ORD-1')
  })

  it('maps a status the docs do not show to UNKNOWN', () => {
    expect(transformShipment({ ...docTrackData(), current_status: 'Somewhere' }).status).toBe(
      'UNKNOWN',
    )
  })

  it('throws without the documented awb_number', () => {
    expect(() => transformShipment({ ...docTrackData(), awb_number: '' })).toThrow(/awb_number/)
  })
})
