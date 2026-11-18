import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  labelFromShipmentEntry,
  type PplCzLabel,
} from '../../../../../../../src/verticals/logistics/adapters/ppl-cz/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

describe('transformLabel', () => {
  it('maps shipmentNumber to id, shipmentId, and trackingNumber', () => {
    const raw: PplCzLabel = {
      shipmentNumber: '41000012345',
      productType: 'BUSS',
      format: 'Pdf',
      labelUrl: 'https://api.ppl.cz/labels/41000012345.pdf',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformLabel(raw)
    expect(result.id).toBe('41000012345')
    expect(result.shipmentId).toBe('41000012345')
    expect(result.trackingNumber).toBe('41000012345')
  })

  it('maps format strings to canonical LabelFormat', () => {
    expect(transformLabel({ format: 'Pdf' }).format).toBe('PDF')
    expect(transformLabel({ format: 'Zpl' }).format).toBe('ZPL')
    expect(transformLabel({ format: 'Png' }).format).toBe('PNG')
    expect(transformLabel({ format: 'Epl' }).format).toBe('EPL2')
    expect(transformLabel({ format: 'unknown_fmt' }).format).toBeUndefined()
  })

  it('sets carrierId=ppl-cz and status=CREATED', () => {
    const result = transformLabel({})
    expect(result.carrierId).toBe('ppl-cz')
    expect(result.status).toBe('CREATED')
  })

  it('maps serviceCode from productType', () => {
    const result = transformLabel({ productType: 'CONN' })
    expect(result.serviceCode).toBe('CONN')
  })

  it('passes schema parse', () => {
    const raw: PplCzLabel = {
      shipmentNumber: '41000099999',
      productType: 'PRIV',
      format: 'Pdf',
      labelUrl: 'https://api.ppl.cz/labels/41000099999.pdf',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformLabel(raw)
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})

describe('labelFromShipmentEntry', () => {
  it('maps shipmentNumber as id, shipmentId, trackingNumber', () => {
    const result = labelFromShipmentEntry('41000055555', 'ref-001', 'BUSS', undefined)
    expect(result.id).toBe('41000055555')
    expect(result.shipmentId).toBe('41000055555')
    expect(result.trackingNumber).toBe('41000055555')
  })

  it('maps labelUrl and productType', () => {
    const result = labelFromShipmentEntry(
      '41000055555',
      'ref-001',
      'CONN',
      'https://api.ppl.cz/labels/41000055555.pdf',
    )
    expect(result.url).toBe('https://api.ppl.cz/labels/41000055555.pdf')
    expect(result.serviceCode).toBe('CONN')
  })

  it('passes schema parse', () => {
    const result = labelFromShipmentEntry('41000077777', 'ref-002', 'PRIV', undefined)
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
