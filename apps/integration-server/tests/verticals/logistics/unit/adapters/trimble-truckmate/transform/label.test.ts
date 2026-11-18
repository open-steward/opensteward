import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type TrimbleTruckmateLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/trimble-truckmate/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(
  overrides: Partial<TrimbleTruckmateLabelResponse> = {},
): TrimbleTruckmateLabelResponse {
  return {
    labelId: 'LBL-001',
    shipmentId: 'SHP-001',
    trackingNumber: 'TRK-001',
    carrierId: 'trimble-truckmate',
    serviceCode: 'FTL',
    labelFormat: 'PDF',
    labelStatus: 'CREATED',
    labelUrl: 'https://labels.example.com/LBL-001.pdf',
    totalPrice: 12.5,
    currency: 'USD',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('trimble-truckmate transformLabel', () => {
  it('maps id from labelId', () => {
    expect(transformLabel(makeLabel()).id).toBe('LBL-001')
  })

  it('maps shipmentId', () => {
    expect(transformLabel(makeLabel()).shipmentId).toBe('SHP-001')
  })

  it('maps trackingNumber', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('TRK-001')
  })

  it('maps carrierId', () => {
    expect(transformLabel(makeLabel()).carrierId).toBe('trimble-truckmate')
  })

  it('maps format from labelFormat', () => {
    // FORMAT_MAP: 'PDF' → 'PDF'
    expect(transformLabel(makeLabel()).format).toBe('PDF')
  })

  it('maps ZPL format', () => {
    expect(transformLabel(makeLabel({ labelFormat: 'ZPL' })).format).toBe('ZPL')
  })

  it('maps status from labelStatus CREATED', () => {
    // STATUS_MAP: 'CREATED' → 'CREATED'
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps url from labelUrl', () => {
    expect(transformLabel(makeLabel()).url).toBe('https://labels.example.com/LBL-001.pdf')
  })

  it('maps cost in minor units (cents)', () => {
    // 12.5 dollars → 1250 cents
    const result = transformLabel(makeLabel())
    expect(result.cost?.amount).toBe(1250)
    expect(result.cost?.currency).toBe('USD')
  })

  it('omits cost when currency is absent', () => {
    const result = transformLabel(makeLabel({ currency: undefined }))
    expect(result.cost).toBeUndefined()
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformLabel(makeLabel())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('falls back id to raw.id', () => {
    expect(transformLabel(makeLabel({ labelId: undefined, id: 'ID-001' })).id).toBe('ID-001')
  })

  it('falls back shipmentId to tripId', () => {
    expect(
      transformLabel(makeLabel({ shipmentId: undefined, tripId: 'TRIP-001' })).shipmentId,
    ).toBe('TRIP-001')
  })

  it('maps VOIDED status', () => {
    // STATUS_MAP: 'VOIDED' → 'VOIDED'
    expect(transformLabel(makeLabel({ labelStatus: 'VOIDED' })).status).toBe('VOIDED')
  })

  it('passes metadata through', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => LabelSchema.parse(transformLabel(makeLabel()))).not.toThrow()
  })
})
