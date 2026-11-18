import { describe, it, expect } from 'vitest'
import { groupCarrierServices } from '../../../../../../../src/verticals/logistics/adapters/skydropx/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import { docCarrierService } from '../fixtures'

describe('Skydropx groupCarrierServices (PRO GET /api/v1/shipments/carrier_services)', () => {
  it('maps the documented example to one carrier and parses as CarrierSchema', () => {
    const [c] = groupCarrierServices([docCarrierService()])
    const out = CarrierSchema.parse(c)
    expect(out.id).toBe('fedex')
    expect(out.code).toBe('fedex')
    expect(out.name).toBe('fedex')
    expect(out.services).toEqual([{ code: 'standard_overnight', name: 'standard_overnight' }])
  })

  it('groups services by carrier_name in first-appearance order', () => {
    const out = groupCarrierServices([
      docCarrierService({ carrier_name: 'fedex', service_code: 'a' }),
      docCarrierService({ carrier_name: 'dhl', service_code: 'b' }),
      docCarrierService({ carrier_name: 'fedex', service_code: 'c' }),
    ]).map((c) => CarrierSchema.parse(c))
    expect(out.map((c) => c.id)).toEqual(['fedex', 'dhl'])
    expect(out[0]!.services!.map((s) => s.code)).toEqual(['a', 'c'])
  })

  it('does not list a service without service_code (CarrierService.code is required)', () => {
    const [c] = groupCarrierServices([docCarrierService({ service_code: null })])
    expect(CarrierSchema.parse(c).services).toEqual([])
  })

  it('drops rows without a carrier_name', () => {
    expect(groupCarrierServices([docCarrierService({ carrier_name: null })])).toEqual([])
  })
})
