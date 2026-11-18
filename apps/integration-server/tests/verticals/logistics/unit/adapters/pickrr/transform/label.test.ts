import { describe, it, expect } from 'vitest'
import { transformLabel } from '../../../../../../../src/verticals/logistics/adapters/pickrr/transform/label'
import type { PickrrShipment } from '../../../../../../../src/verticals/logistics/adapters/pickrr/transform/shipment'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<PickrrShipment> = {}): PickrrShipment {
  return {
    order_pk: 12345,
    tracking_id: 'PCKR-TRK-001',
    order_service_used: 'FedEx',
    status: 'in_transit',
    to_name: 'Recipient',
    to_phone_number: '+919876543210',
    to_email: 'recipient@example.in',
    to_address: '10 MG Road',
    to_city: 'Bengaluru',
    to_state: 'Karnataka',
    to_pincode: '560001',
    to_country: 'India',
    from_name: 'Seller',
    from_phone_number: '+919876540000',
    from_address: '5 Nehru St',
    from_city: 'Mumbai',
    from_state: 'Maharashtra',
    from_pincode: '400001',
    from_country: 'India',
    item_name: 'Widget',
    weight: 1.2,
    label_url: 'https://labels.pickrr.example/12345.pdf',
    estimated_delivery_date: '2024-03-04T00:00:00Z',
    delivered_date: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pickrr transformLabel', () => {
  it('maps id from order_pk as string', () => {
    expect(transformLabel(makeShipment()).id).toBe('12345')
  })

  it('maps shipmentId from order_pk as string', () => {
    expect(transformLabel(makeShipment()).shipmentId).toBe('12345')
  })

  it('falls back id to tracking_id when order_pk is null', () => {
    expect(transformLabel(makeShipment({ order_pk: null })).id).toBe('PCKR-TRK-001')
  })

  it('maps trackingNumber from tracking_id', () => {
    expect(transformLabel(makeShipment()).trackingNumber).toBe('PCKR-TRK-001')
  })

  it('maps carrierId from order_service_used', () => {
    expect(transformLabel(makeShipment()).carrierId).toBe('FedEx')
  })

  it('sets format to PDF', () => {
    expect(transformLabel(makeShipment()).format).toBe('PDF')
  })

  it('sets status to CREATED when label_url is present', () => {
    expect(transformLabel(makeShipment()).status).toBe('CREATED')
  })

  it('status is undefined when label_url is null', () => {
    expect(transformLabel(makeShipment({ label_url: null })).status).toBeUndefined()
  })

  it('maps url from label_url', () => {
    expect(transformLabel(makeShipment()).url).toBe('https://labels.pickrr.example/12345.pdf')
  })

  it('parses created_at as createdAt Date', () => {
    expect(transformLabel(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('parses updated_at as updatedAt Date', () => {
    expect(transformLabel(makeShipment()).updatedAt).toBeInstanceOf(Date)
  })

  it('passes metadata as raw object', () => {
    const raw = makeShipment()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('passes LabelSchema validation', () => {
    expect(() => LabelSchema.parse(transformLabel(makeShipment()))).not.toThrow()
  })
})
