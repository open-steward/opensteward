import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type PacketaCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/packeta/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

/**
 * The first entry of the "Result JSON" example on
 * https://docs.packeta.com/docs/home-delivery/carriers, verbatim — every
 * value a string, as the example sends it.
 */
const DOC_CARRIER: PacketaCarrier = {
  id: '80',
  name: 'AT Rakouská pošta HD',
  available: 'true',
  pickupPoints: 'false',
  apiAllowed: 'true',
  separateHouseNumber: 'false',
  customsDeclarations: 'false',
  requiresEmail: 'true',
  requiresPhone: 'true',
  requiresSize: 'false',
  disallowsCod: 'false',
  country: 'at',
  currency: 'EUR',
  maxWeight: '30',
  labelRouting: 'C37-118-080',
  labelName: 'AT Rakouská pošta HD',
}

describe('transformCarrier', () => {
  it('maps the documented example entry onto a valid Carrier', () => {
    const result = CarrierSchema.parse(transformCarrier(DOC_CARRIER))

    expect(result.id).toBe('80')
    expect(result.code).toBe('80')
    expect(result.name).toBe('AT Rakouská pošta HD')
    expect(result.isActive).toBe(true)
    expect(result.metadata).toEqual({
      pickupPoints: false,
      apiAllowed: true,
      separateHouseNumber: false,
      customsDeclarations: false,
      requiresEmail: true,
      requiresPhone: true,
      requiresSize: false,
      disallowsCod: false,
      country: 'at',
      currency: 'EUR',
      maxWeight: '30',
      labelRouting: 'C37-118-080',
      labelName: 'AT Rakouská pošta HD',
    })
  })

  it('reads the flags when they arrive as the Boolean the table documents', () => {
    const result = CarrierSchema.parse(
      transformCarrier({ ...DOC_CARRIER, id: 80, available: false, apiAllowed: true }),
    )
    expect(result.id).toBe('80')
    expect(result.isActive).toBe(false)
    expect(result.metadata?.apiAllowed).toBe(true)
  })

  it('leaves isActive unset when available is absent, rather than assuming', () => {
    const { available: _available, ...rest } = DOC_CARRIER
    const result = CarrierSchema.parse(transformCarrier(rest))
    expect(result.isActive).toBeUndefined()
  })

  it('does not invent a name when the entry has none', () => {
    const { name: _name, ...rest } = DOC_CARRIER
    const result = CarrierSchema.parse(transformCarrier(rest))
    expect(result.name).toBeUndefined()
  })

  it('throws on an entry with no id instead of emitting an empty one', () => {
    const { id: _id, ...rest } = DOC_CARRIER
    expect(() => transformCarrier(rest)).toThrow(/no id/)
  })
})
