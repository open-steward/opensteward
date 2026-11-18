import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  type ShipKaroManifest,
} from '../../../../../../../src/verticals/logistics/adapters/shipkaro/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

function makeRaw(overrides: Partial<ShipKaroManifest> = {}): ShipKaroManifest {
  return {
    id: 55,
    manifest_id: 'MAN-001',
    carrier_id: 10,
    carrier_name: 'BlueDart',
    pickup_address_id: 7,
    status: 'SUBMITTED',
    shipment_ids: [101, 102, 103],
    shipment_count: 3,
    generated_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformManifest', () => {
  it('maps id from manifest_id', () => {
    expect(transformManifest(makeRaw()).id).toBe('MAN-001')
  })

  it('falls back to stringified id when manifest_id absent', () => {
    expect(transformManifest(makeRaw({ manifest_id: null })).id).toBe('55')
  })

  it('maps carrierId from carrier_name', () => {
    expect(transformManifest(makeRaw()).carrierId).toBe('BlueDart')
  })

  it('falls back to stringified carrier_id when carrier_name absent', () => {
    expect(transformManifest(makeRaw({ carrier_name: null })).carrierId).toBe('10')
  })

  it('maps warehouseId from pickup_address_id', () => {
    expect(transformManifest(makeRaw()).warehouseId).toBe('7')
  })

  it('maps manifestNumber equal to id', () => {
    expect(transformManifest(makeRaw()).manifestNumber).toBe('MAN-001')
  })

  it('maps SUBMITTED status', () => {
    expect(transformManifest(makeRaw({ status: 'SUBMITTED' })).status).toBe('SUBMITTED')
  })

  it('maps OPEN status for PENDING', () => {
    expect(transformManifest(makeRaw({ status: 'PENDING' })).status).toBe('OPEN')
  })

  it('maps ACCEPTED status', () => {
    expect(transformManifest(makeRaw({ status: 'ACCEPTED' })).status).toBe('ACCEPTED')
  })

  it('maps shipmentIds as string array', () => {
    expect(transformManifest(makeRaw()).shipmentIds).toEqual(['101', '102', '103'])
  })

  it('maps labelCount from shipment_count', () => {
    expect(transformManifest(makeRaw()).labelCount).toBe(3)
  })

  it('maps submittedAt from generated_at', () => {
    expect(transformManifest(makeRaw()).submittedAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('passes schema validation', () => {
    const result = transformManifest(makeRaw())
    expect(() => ManifestSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformManifest(raw).metadata).toBe(raw)
  })
})
