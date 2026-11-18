import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type FrenetLabel,
} from '../../../../../../../src/verticals/logistics/adapters/frenet/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<FrenetLabel> = {}): FrenetLabel {
  return {
    ShipmentId: 'shp-001',
    TrackingNumber: 'BR123456789BR',
    Carrier: 'Correios',
    CarrierCode: '04014',
    LabelUrl: 'https://labels.frenet.example/shp-001.pdf',
    LabelContent: null,
    ShippingPrice: '19.50',
    Status: 'Active',
    CreatedDate: '2024-03-01T00:00:00Z',
    UpdatedDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('frenet transformLabel', () => {
  it('maps ShipmentId as id and shipmentId', () => {
    const result = transformLabel(makeLabel())
    expect(result.id).toBe('shp-001')
    expect(result.shipmentId).toBe('shp-001')
  })

  it('maps TrackingNumber', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('BR123456789BR')
  })

  it('maps Carrier as carrierId', () => {
    expect(transformLabel(makeLabel()).carrierId).toBe('Correios')
  })

  it('maps CarrierCode as serviceCode', () => {
    expect(transformLabel(makeLabel()).serviceCode).toBe('04014')
  })

  it('always emits format PDF', () => {
    expect(transformLabel(makeLabel()).format).toBe('PDF')
  })

  it('maps Active status → CREATED', () => {
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps cancelled status → VOIDED', () => {
    expect(transformLabel(makeLabel({ Status: 'Cancelado' })).status).toBe('VOIDED')
  })

  it('maps postado status → USED', () => {
    expect(transformLabel(makeLabel({ Status: 'postado' })).status).toBe('USED')
  })

  it('maps null status → CREATED', () => {
    expect(transformLabel(makeLabel({ Status: null })).status).toBe('CREATED')
  })

  it('maps LabelUrl as url', () => {
    expect(transformLabel(makeLabel()).url).toBe('https://labels.frenet.example/shp-001.pdf')
  })

  it('maps ShippingPrice as cost in BRL (minor units)', () => {
    const result = transformLabel(makeLabel())
    expect(result.cost?.amount).toBe(1950)
    expect(result.cost?.currency).toBe('BRL')
  })

  it('omits cost when ShippingPrice is null', () => {
    expect(transformLabel(makeLabel({ ShippingPrice: null })).cost).toBeUndefined()
  })

  it('maps createdAt as Date', () => {
    expect(transformLabel(makeLabel()).createdAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema validation', () => {
    const result = transformLabel(makeLabel())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
