import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type UnifiedShippingLabel,
} from '../../../../../../../src/verticals/logistics/adapters/unified-to-shipping/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<UnifiedShippingLabel> = {}): UnifiedShippingLabel {
  return {
    id: 'LBL-U-001',
    shipmentId: 'SHP-U-001',
    trackingNumber: 'TRK-U-001',
    serviceCode: 'GROUND',
    labelUrl: 'https://labels.example.com/LBL-U-001.pdf',
    labelFormat: 'PDF',
    labelCost: 1250,
    labelCostCurrency: 'USD',
    status: 'LABEL_CREATED',
    isVoided: false,
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('unified-to-shipping transformLabel', () => {
  it('maps id', () => {
    expect(transformLabel(makeLabel()).id).toBe('LBL-U-001')
  })

  it('maps shipmentId', () => {
    expect(transformLabel(makeLabel()).shipmentId).toBe('SHP-U-001')
  })

  it('maps trackingNumber', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('TRK-U-001')
  })

  it('maps serviceCode', () => {
    expect(transformLabel(makeLabel()).serviceCode).toBe('GROUND')
  })

  it('maps url from labelUrl', () => {
    expect(transformLabel(makeLabel()).url).toBe('https://labels.example.com/LBL-U-001.pdf')
  })

  it('maps format from labelFormat PDF', () => {
    expect(transformLabel(makeLabel()).format).toBe('PDF')
  })

  it('maps format ZPL', () => {
    expect(transformLabel(makeLabel({ labelFormat: 'ZPL' })).format).toBe('ZPL')
  })

  it('maps EPL/EPL2 to EPL2', () => {
    expect(transformLabel(makeLabel({ labelFormat: 'EPL' })).format).toBe('EPL2')
    expect(transformLabel(makeLabel({ labelFormat: 'EPL2' })).format).toBe('EPL2')
  })

  it('maps LABEL_CREATED status to CREATED', () => {
    // mapLabelStatus: 'LABEL_CREATED' → 'CREATED'
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps PICKED_UP status to USED', () => {
    // mapLabelStatus: 'PICKED_UP' → 'USED'
    expect(transformLabel(makeLabel({ status: 'PICKED_UP' })).status).toBe('USED')
  })

  it('maps CANCELLED status to VOIDED', () => {
    expect(transformLabel(makeLabel({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('overrides status with VOIDED when isVoided=true', () => {
    expect(transformLabel(makeLabel({ isVoided: true, status: 'LABEL_CREATED' })).status).toBe(
      'VOIDED',
    )
  })

  it('maps cost from labelCost (already in minor units for unified.to)', () => {
    // Unified.to labelCost is stored as-is (not multiplied)
    const result = transformLabel(makeLabel())
    expect(result.cost?.amount).toBe(1250)
    expect(result.cost?.currency).toBe('USD')
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformLabel(makeLabel())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes metadata through', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => LabelSchema.parse(transformLabel(makeLabel()))).not.toThrow()
  })
})
