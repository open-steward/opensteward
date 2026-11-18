import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type ChazkiShipment,
} from '../../../../../../../src/verticals/logistics/adapters/chazki/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<ChazkiShipment> = {}): ChazkiShipment {
  return {
    id: 'shp-001',
    code: 'CHZ-0000001',
    tracking_number: 'TRK-001',
    status: 'DELIVERED',
    service: 'EXPRESS',
    carrier: 'chazki',
    weight: 2.5,
    declared_value: 100,
    currency: 'PEN',
    label_url: 'https://example.com/label.pdf',
    origin: {
      name: 'Alice',
      address_line1: '123 Main St',
      city: 'Lima',
      country_code: 'PE',
    },
    destination: {
      name: 'Bob',
      address_line1: '456 Oak Ave',
      city: 'Cusco',
      country_code: 'PE',
    },
    notes: 'Handle with care',
    reference: 'REF-001',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── Core field mapping ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps all core fields correctly', () => {
    const result = transformShipment(makeShipment())

    expect(result.id).toBe('shp-001')
    expect(result.status).toBe('DELIVERED')
    expect(result.trackingNumber).toBe('TRK-001')
    expect(result.carrierId).toBe('chazki')
    expect(result.originAddress?.name).toBe('Alice')
    expect(result.destinationAddress?.name).toBe('Bob')
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
    expect(result.labelUrl).toBe('https://example.com/label.pdf')
    expect(result.notes).toBe('Handle with care')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  // ─── Status mapping ─────────────────────────────────────────────────────────

  describe('status mapping', () => {
    it.each([
      ['NEW', 'PENDING'],
      ['GOTO_PICK', 'LABEL_CREATED'],
      ['EN_CAMINO', 'IN_TRANSIT'],
      ['ARRIVED_DELIVER', 'OUT_FOR_DELIVERY'],
      ['ENTREGADO', 'DELIVERED'],
      ['DEVUELTO', 'RETURNED'],
      ['CANCELADO', 'CANCELLED'],
      ['FAILED_DROP', 'EXCEPTION'],
      ['something_else', 'UNKNOWN'],
    ] as const)('maps %s → %s', (chazkiStatus, expected) => {
      const result = transformShipment(makeShipment({ status: chazkiStatus }))
      expect(result.status).toBe(expected)
    })

    it('maps null status to UNKNOWN', () => {
      const result = transformShipment(makeShipment({ status: null }))
      expect(result.status).toBe('UNKNOWN')
    })
  })

  // ─── Address fallbacks ───────────────────────────────────────────────────────

  it('falls back to sender/receiver when origin/destination are null', () => {
    const result = transformShipment(
      makeShipment({
        origin: null,
        destination: null,
        sender: {
          name: 'SenderName',
          address_line1: '1 Sender St',
          city: 'Arequipa',
          country_code: 'PE',
        },
        receiver: {
          name: 'ReceiverName',
          address_line1: '2 Receiver Ave',
          city: 'Trujillo',
          country_code: 'PE',
        },
      }),
    )

    expect(result.originAddress?.name).toBe('SenderName')
    expect(result.destinationAddress?.name).toBe('ReceiverName')
  })

  it('has undefined originAddress/destinationAddress when all address fields are null', () => {
    const result = transformShipment(
      makeShipment({ origin: null, destination: null, sender: null, receiver: null }),
    )
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  // ─── Tracking number fallback ────────────────────────────────────────────────

  it('falls back to code when tracking_number is null', () => {
    const result = transformShipment(
      makeShipment({ tracking_number: null, tracking_code: undefined }),
    )
    // Falls back to code = 'CHZ-0000001'
    expect(result.trackingNumber).toBe('CHZ-0000001')
  })

  it('uses tracking_code when tracking_number is null and tracking_code is set', () => {
    const result = transformShipment(
      makeShipment({ tracking_number: null, tracking_code: 'CODE-XYZ' }),
    )
    expect(result.trackingNumber).toBe('CODE-XYZ')
  })

  // ─── Label URL fallback ──────────────────────────────────────────────────────

  it('falls back to label field when label_url is null', () => {
    const result = transformShipment(
      makeShipment({ label_url: null, label: 'https://example.com/fallback.pdf' }),
    )
    expect(result.labelUrl).toBe('https://example.com/fallback.pdf')
  })

  // ─── Weight ──────────────────────────────────────────────────────────────────

  it('returns undefined totalWeight when weight is null', () => {
    const result = transformShipment(makeShipment({ weight: null }))
    expect(result.totalWeight).toBeUndefined()
  })

  // ─── Cost ────────────────────────────────────────────────────────────────────

  it('maps declared_value to cost', () => {
    const result = transformShipment(makeShipment({ declared_value: 200, currency: 'USD' }))
    expect(result.cost?.amount).toBe(200)
    expect(result.cost?.currency).toBe('USD')
  })

  it('returns undefined cost when declared_value is null', () => {
    const result = transformShipment(makeShipment({ declared_value: null }))
    expect(result.cost).toBeUndefined()
  })

  // ─── Default carrierId ───────────────────────────────────────────────────────

  it('defaults carrierId to chazki when carrier is null', () => {
    const result = transformShipment(makeShipment({ carrier: null }))
    expect(result.carrierId).toBe('chazki')
  })
})
