import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type GigLabel,
} from '../../../../../../../src/verticals/logistics/adapters/gig-logistics/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<GigLabel> = {}): GigLabel {
  return {
    id: 'lbl-001',
    shipmentId: 'gig-shp-001',
    waybillNumber: 'WB123456',
    labelUrl: 'https://labels.giglogistics.example/WB123456.pdf',
    format: 'pdf',
    status: 'created',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('gig-logistics transformLabel', () => {
  it('maps id', () => {
    expect(transformLabel(makeLabel()).id).toBe('lbl-001')
  })

  it('maps shipmentId from raw shipmentId', () => {
    expect(transformLabel(makeLabel()).shipmentId).toBe('gig-shp-001')
  })

  it('uses shipmentId param as fallback when raw.shipmentId is null', () => {
    expect(transformLabel(makeLabel({ shipmentId: null }), 'fallback-shp').shipmentId).toBe(
      'fallback-shp',
    )
  })

  it('maps waybillNumber as trackingNumber', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('WB123456')
  })

  it('uses trackingNumber param as fallback when waybillNumber is null', () => {
    expect(
      transformLabel(makeLabel({ waybillNumber: null }), undefined, 'WB-FALLBACK').trackingNumber,
    ).toBe('WB-FALLBACK')
  })

  it('always sets carrierId to "gig-logistics"', () => {
    expect(transformLabel(makeLabel()).carrierId).toBe('gig-logistics')
  })

  it('maps pdf format → PDF', () => {
    expect(transformLabel(makeLabel()).format).toBe('PDF')
  })

  it('maps png format → PNG', () => {
    expect(transformLabel(makeLabel({ format: 'png' })).format).toBe('PNG')
  })

  it('maps zpl format → ZPL', () => {
    expect(transformLabel(makeLabel({ format: 'zpl' })).format).toBe('ZPL')
  })

  it('maps unknown format → undefined', () => {
    expect(transformLabel(makeLabel({ format: 'bmp' })).format).toBeUndefined()
  })

  it('maps null format → undefined', () => {
    expect(transformLabel(makeLabel({ format: null })).format).toBeUndefined()
  })

  it('maps status "created" → CREATED', () => {
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps status "voided" → VOIDED', () => {
    expect(transformLabel(makeLabel({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps status "refunded" → REFUNDED', () => {
    expect(transformLabel(makeLabel({ status: 'refunded' })).status).toBe('REFUNDED')
  })

  it('maps status "used" → USED', () => {
    expect(transformLabel(makeLabel({ status: 'used' })).status).toBe('USED')
  })

  it('maps labelUrl as url', () => {
    expect(transformLabel(makeLabel()).url).toBe('https://labels.giglogistics.example/WB123456.pdf')
  })

  it('maps createdAt as Date', () => {
    expect(transformLabel(makeLabel()).createdAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema validation', () => {
    expect(() => LabelSchema.parse(transformLabel(makeLabel()))).not.toThrow()
  })
})
