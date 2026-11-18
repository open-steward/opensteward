import { describe, it, expect } from 'vitest'
import { transformLabel } from '../../../../../../../src/verticals/logistics/adapters/shipcloud/transform/label'
import type { ShipcloudShipment } from '../../../../../../../src/verticals/logistics/adapters/shipcloud/transform/shipment'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeShipment(overrides: Partial<ShipcloudShipment> = {}): ShipcloudShipment {
  return {
    id: 'sc-shp-001',
    carrier_tracking_no: 'JD000300006123456789',
    label_url: 'https://api.shipcloud.io/v1/shipments/sc-shp-001/label',
    price: 5.99,
    carrier: 'dhl',
    service: 'standard',
    reference_number: 'REF-001',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLabel (shipcloud)', () => {
  it('maps id and shipmentId from shipment id', () => {
    const result = transformLabel(makeShipment())
    expect(result.id).toBe('sc-shp-001')
    expect(result.shipmentId).toBe('sc-shp-001')
  })

  it('maps trackingNumber from carrier_tracking_no', () => {
    expect(transformLabel(makeShipment()).trackingNumber).toBe('JD000300006123456789')
  })

  it('maps carrierId from carrier field', () => {
    expect(transformLabel(makeShipment()).carrierId).toBe('dhl')
  })

  it('maps serviceCode from service field', () => {
    expect(transformLabel(makeShipment()).serviceCode).toBe('standard')
  })

  it('format is always PDF', () => {
    expect(transformLabel(makeShipment()).format).toBe('PDF')
  })

  it('status is always CREATED', () => {
    expect(transformLabel(makeShipment()).status).toBe('CREATED')
  })

  it('maps url from label_url', () => {
    expect(transformLabel(makeShipment()).url).toBe(
      'https://api.shipcloud.io/v1/shipments/sc-shp-001/label',
    )
  })

  it('maps cost amount from price in EUR', () => {
    const result = transformLabel(makeShipment({ price: 5.99 }))
    // 5.99 EUR → 599 euro-cents (integer minor units)
    expect(result.cost?.amount).toBe(599)
    expect(result.cost?.currency).toBe('EUR')
  })

  it('maps createdAt as Date', () => {
    expect(transformLabel(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeShipment()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('omits cost when price is null', () => {
    expect(transformLabel(makeShipment({ price: null })).cost).toBeUndefined()
  })

  it('LabelSchema.parse passes when price is a decimal (converted to integer minor-units)', () => {
    // transformLabel converts 5.99 EUR → 599 euro-cents, satisfying Amount = z.number().int()
    const result = transformLabel(makeShipment({ price: 5.99 }))
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('LabelSchema.parse passes when price is integer and url is valid', () => {
    const result = transformLabel(makeShipment({ price: 599 }))
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
