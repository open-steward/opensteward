import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type ShipEngineLabel,
} from '../../../../../../../src/verticals/logistics/adapters/shipengine/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<ShipEngineLabel> = {}): ShipEngineLabel {
  return {
    label_id: 'se-lbl-001',
    status: 'completed',
    shipment_id: 'se-shp-001',
    carrier_id: 'se-12345',
    carrier_code: 'ups',
    service_code: 'ups_ground',
    label_format: 'pdf',
    tracking_number: '1Z999AA10123456784',
    shipment_cost: { currency: 'USD', amount: 12.5 },
    insurance_cost: { currency: 'USD', amount: 0 },
    confirmation_amount: { currency: 'USD', amount: 0 },
    other_amount: { currency: 'USD', amount: 0 },
    label_download: {
      href: 'https://api.shipengine.com/v1/downloads/se-lbl-001.pdf',
      pdf: 'https://api.shipengine.com/v1/downloads/se-lbl-001.pdf',
    },
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLabel (shipengine)', () => {
  it('maps id from label_id', () => {
    expect(transformLabel(makeLabel()).id).toBe('se-lbl-001')
  })

  it('maps shipmentId from shipment_id', () => {
    expect(transformLabel(makeLabel()).shipmentId).toBe('se-shp-001')
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('1Z999AA10123456784')
  })

  it('maps carrierId from carrier_id', () => {
    expect(transformLabel(makeLabel()).carrierId).toBe('se-12345')
  })

  it('maps serviceCode from service_code', () => {
    expect(transformLabel(makeLabel()).serviceCode).toBe('ups_ground')
  })

  it('maps format: pdf → PDF', () => {
    expect(transformLabel(makeLabel({ label_format: 'pdf' })).format).toBe('PDF')
  })

  it('maps format: zpl → ZPL', () => {
    expect(transformLabel(makeLabel({ label_format: 'zpl' })).format).toBe('ZPL')
  })

  it('maps status: completed → CREATED', () => {
    expect(transformLabel(makeLabel({ status: 'completed' })).status).toBe('CREATED')
  })

  it('maps status: voided → VOIDED', () => {
    expect(transformLabel(makeLabel({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps url from label_download.href', () => {
    expect(transformLabel(makeLabel()).url).toBe(
      'https://api.shipengine.com/v1/downloads/se-lbl-001.pdf',
    )
  })

  it('maps cost summing shipment_cost + insurance_cost amounts converted to minor units', () => {
    const result = transformLabel(
      makeLabel({
        shipment_cost: { currency: 'USD', amount: 10 },
        insurance_cost: { currency: 'USD', amount: 2 },
      }),
    )
    // 10 + 2 = 12 major units → Math.round(12 * 100) = 1200 minor units
    expect(result.cost?.amount).toBe(1200)
    expect(result.cost?.currency).toBe('USD')
  })

  it('omits cost when totalCost is 0', () => {
    const result = transformLabel(
      makeLabel({
        shipment_cost: { currency: 'USD', amount: 0 },
        insurance_cost: { currency: 'USD', amount: 0 },
      }),
    )
    expect(result.cost).toBeUndefined()
  })

  it('maps createdAt as Date', () => {
    expect(transformLabel(makeLabel()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('LabelSchema.parse passes when cost amount is converted to integer minor-units', () => {
    // 12.5 major units → Math.round(12.5 * 100) = 1250 minor units (integer)
    const result = transformLabel(makeLabel({ shipment_cost: { currency: 'USD', amount: 12.5 } }))
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('LabelSchema.parse passes when cost is integer and url is valid', () => {
    const result = transformLabel(
      makeLabel({
        shipment_cost: { currency: 'USD', amount: 1250 },
        insurance_cost: { currency: 'USD', amount: 0 },
      }),
    )
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
