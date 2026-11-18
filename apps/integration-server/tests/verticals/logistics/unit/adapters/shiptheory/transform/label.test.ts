import { describe, it, expect } from 'vitest'
import { transformShipmentToLabel } from '../../../../../../../src/verticals/logistics/adapters/shiptheory/transform/label'
import type { ShiptheoryShipment } from '../../../../../../../src/verticals/logistics/adapters/shiptheory/transform/shipment'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeShipment(overrides: Partial<ShiptheoryShipment> = {}): ShiptheoryShipment {
  return {
    channel_reference_id: 'REF-001',
    tracking_number: 'TRK123456',
    carrier: 'dpd',
    service_name: 'DPD_NEXT_DAY',
    label: 'JVBERi0xLjQ=',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('Shiptheory transformShipmentToLabel', () => {
  it('maps channel_reference_id to id and shipmentId', () => {
    const result = transformShipmentToLabel(makeShipment())
    expect(result.id).toBe('REF-001')
    expect(result.shipmentId).toBe('REF-001')
  })

  it('maps tracking_number and carrier', () => {
    const result = transformShipmentToLabel(makeShipment())
    expect(result.trackingNumber).toBe('TRK123456')
    expect(result.carrierId).toBe('dpd')
  })

  it('always emits PDF format and CREATED status', () => {
    const result = transformShipmentToLabel(makeShipment())
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
  })

  it('maps label base64 and service_name to serviceCode', () => {
    const result = transformShipmentToLabel(makeShipment())
    expect(result.base64).toBe('JVBERi0xLjQ=')
    expect(result.serviceCode).toBe('DPD_NEXT_DAY')
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformShipmentToLabel(makeShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema validation', () => {
    const result = transformShipmentToLabel(makeShipment())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('handles null optional fields gracefully', () => {
    const result = transformShipmentToLabel(
      makeShipment({ tracking_number: null, carrier: null, label: null, created_at: null }),
    )
    expect(result.trackingNumber).toBeUndefined()
    expect(result.carrierId).toBeUndefined()
    expect(result.base64).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })
})
