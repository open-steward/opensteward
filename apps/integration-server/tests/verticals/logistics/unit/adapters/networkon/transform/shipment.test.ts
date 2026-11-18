import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type NetworkONShipment,
} from '../../../../../../../src/verticals/logistics/adapters/networkon/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<NetworkONShipment> = {}): NetworkONShipment {
  return {
    id: 'ship-001',
    order_number: 'ORD-2024-001',
    status: 'in_transit',
    tracking_number: 'TRACK-XYZ',
    carrier: 'DHL',
    service_code: 'EXPRESS',
    origin: { name: 'Sender', city: 'Origin City', country: 'US' },
    destination: { name: 'Receiver', city: 'Dest City', country: 'US' },
    estimated_delivery: '2024-03-05T00:00:00Z',
    actual_delivery: null,
    label_url: 'https://example.com/label.pdf',
    weight: 2.5,
    weight_unit: 'kg',
    notes: 'Fragile',
    reference: 'REF-001',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T08:00:00Z',
    ...overrides,
  }
}

describe('networkon transformShipment', () => {
  it('maps id from raw.id as string', () => {
    expect(transformShipment(makeShipment()).id).toBe('ship-001')
  })

  it('maps numeric id to string', () => {
    expect(transformShipment(makeShipment({ id: 42 })).id).toBe('42')
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('TRACK-XYZ')
  })

  it('falls back trackingNumber to order_number when tracking_number is null', () => {
    const result = transformShipment(makeShipment({ tracking_number: null }))
    expect(result.trackingNumber).toBe('ORD-2024-001')
  })

  it('maps carrierId from carrier field', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('DHL')
  })

  it('defaults carrierId to "networkon" when carrier is null', () => {
    const result = transformShipment(makeShipment({ carrier: null }))
    expect(result.carrierId).toBe('networkon')
  })

  it('maps serviceCode from service_code', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('EXPRESS')
  })

  it('maps status in_transit → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps status delivered → DELIVERED', () => {
    expect(transformShipment(makeShipment({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps status pending → PENDING', () => {
    expect(transformShipment(makeShipment({ status: 'pending' })).status).toBe('PENDING')
  })

  it('maps status label_created → LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ status: 'label_created' })).status).toBe(
      'LABEL_CREATED',
    )
  })

  it('maps status out_for_delivery → OUT_FOR_DELIVERY', () => {
    expect(transformShipment(makeShipment({ status: 'out_for_delivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps status exception → EXCEPTION', () => {
    expect(transformShipment(makeShipment({ status: 'exception' })).status).toBe('EXCEPTION')
  })

  it('maps status returned → RETURNED', () => {
    expect(transformShipment(makeShipment({ status: 'returned' })).status).toBe('RETURNED')
  })

  it('maps status cancelled → CANCELLED', () => {
    expect(transformShipment(makeShipment({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformShipment(makeShipment({ status: 'mystery' })).status).toBe('UNKNOWN')
  })

  it('maps originAddress from origin', () => {
    expect(transformShipment(makeShipment()).originAddress?.city).toBe('Origin City')
  })

  it('maps destinationAddress from destination', () => {
    expect(transformShipment(makeShipment()).destinationAddress?.city).toBe('Dest City')
  })

  it('maps labelUrl from label_url', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe('https://example.com/label.pdf')
  })

  it('maps reference from order_number preferring order_number', () => {
    expect(transformShipment(makeShipment()).reference).toBe('ORD-2024-001')
  })

  it('maps notes', () => {
    expect(transformShipment(makeShipment()).notes).toBe('Fragile')
  })

  it('maps createdAt and updatedAt as Dates', () => {
    const result = transformShipment(makeShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})
