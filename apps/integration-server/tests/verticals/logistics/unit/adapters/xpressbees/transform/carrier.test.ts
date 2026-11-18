import { describe, it, expect } from 'vitest'
import { transformCarrier } from '../../../../../../../src/verticals/logistics/adapters/xpressbees/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import { docCourierList } from '../fixtures'

describe('xpressbees transformCarrier', () => {
  it('maps every documented Courier List row to a valid Carrier', () => {
    const out = docCourierList.data.map((row) => CarrierSchema.parse(transformCarrier(row)))
    expect(out.map((c) => c.id)).toEqual(['6', '8', '1', '12298', '4', '2', '3', '12939', '12938'])
    expect(out[0]).toMatchObject({ id: '6', code: '6', name: 'Air Xpressbees 0.5 K.G' })
  })

  it('claims nothing the row does not say', () => {
    const c = CarrierSchema.parse(transformCarrier(docCourierList.data[1]!))
    expect(c.isActive).toBeUndefined()
    expect(c.services).toBeUndefined()
  })

  it('refuses a row without an id', () => {
    expect(() => transformCarrier({ name: 'x' })).toThrow(/no id/)
  })
})
