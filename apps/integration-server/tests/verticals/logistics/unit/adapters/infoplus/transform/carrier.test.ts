/**
 * Fixture: the `carrier` definition of the v2.0 swagger
 * (https://developer.infopluscommerce.com/api/reference/v2.0/swagger.json),
 * whose only properties are `carrier` (integer) and `label` (string). The
 * swagger ships no example body, so the fixture carries exactly those keys.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type InfoplusCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/infoplus/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

const DOCUMENTED: InfoplusCarrier = { carrier: 100, label: 'UPS Ground' }

describe('infoplus transformCarrier', () => {
  it('maps the documented carrier id and label, and parses as a Carrier', () => {
    const out = CarrierSchema.parse(transformCarrier(DOCUMENTED))
    expect(out.id).toBe('100')
    expect(out.name).toBe('UPS Ground')
    expect(out.metadata).toEqual(DOCUMENTED)
  })

  it('invents no code, activity flag or timestamps the definition does not have', () => {
    const out = transformCarrier(DOCUMENTED)
    expect(out.code).toBeUndefined()
    expect(out.isActive).toBeUndefined()
    expect(out.createdAt).toBeUndefined()
  })

  it('leaves id undefined when carrier is absent', () => {
    expect(CarrierSchema.parse(transformCarrier({ label: 'x' })).id).toBeUndefined()
  })
})
