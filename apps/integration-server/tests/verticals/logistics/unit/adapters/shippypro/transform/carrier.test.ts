/**
 * Fixture: the documented example of GetCarriersResponse
 * (https://api.shippypro.com/docs/v1.json): "Carriers" keyed by carrier name,
 * each an array of connections {CarrierID "10", CarrierService "NextDayAir",
 * ServicesList ["NextDayAir","2ndDayAir","Ground"], Label "UPS"}.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  transformCarriers,
  type ShippyProCarriersResponse,
} from '../../../../../../../src/verticals/logistics/adapters/shippypro/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

const CONNECTION = {
  CarrierID: '10',
  CarrierService: 'NextDayAir',
  ServicesList: ['NextDayAir', '2ndDayAir', 'Ground'],
  Label: 'UPS',
}

describe('transformCarrier (shippypro GetCarriers connection)', () => {
  it('maps CarrierID to id, the carrier-name key to code, Label to name and ServicesList to services', () => {
    const c = CarrierSchema.parse(transformCarrier('UPS', CONNECTION))
    expect(c.id).toBe('10')
    expect(c.code).toBe('UPS')
    expect(c.name).toBe('UPS')
    expect(c.services).toEqual([{ code: 'NextDayAir' }, { code: '2ndDayAir' }, { code: 'Ground' }])
  })

  it('leaves services out when ServicesList is empty or absent', () => {
    expect(
      CarrierSchema.parse(transformCarrier('UPS', { CarrierID: '10' })).services,
    ).toBeUndefined()
    expect(
      CarrierSchema.parse(transformCarrier('UPS', { CarrierID: '10', ServicesList: [] })).services,
    ).toBeUndefined()
  })

  it('keeps the raw connection and its carrier name in metadata', () => {
    expect(transformCarrier('UPS', CONNECTION).metadata).toEqual({
      carrierName: 'UPS',
      ...CONNECTION,
    })
  })
})

describe('transformCarriers (shippypro GetCarriers response)', () => {
  it('flattens every connection of every carrier, in order', () => {
    const res: ShippyProCarriersResponse = {
      Carriers: {
        UPS: [CONNECTION, { ...CONNECTION, CarrierID: '11' }],
        DHLExpress: [{ CarrierID: '161', Label: 'DHL' }],
      },
    }
    const rows = transformCarriers(res).map((c) => CarrierSchema.parse(c))
    expect(rows.map((c) => [c.id, c.code])).toEqual([
      ['10', 'UPS'],
      ['11', 'UPS'],
      ['161', 'DHLExpress'],
    ])
  })

  it('an empty or absent Carriers object is no carriers', () => {
    expect(transformCarriers({})).toEqual([])
    expect(transformCarriers({ Carriers: {} })).toEqual([])
  })
})
