import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawCentraCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/centra/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawCentraCustomer> = {}): RawCentraCustomer {
  return {
    customerId: 88,
    email: 'user@centra.se',
    firstName: 'Anna',
    lastName: 'Andersson',
    address1: 'Kungsgatan 1',
    address2: 'Lgh 2',
    zipCode: '11122',
    city: 'Stockholm',
    state: 'Stockholm County',
    country: 'SE',
    phoneNumber: '+46701234567',
    newsletter: true,
    created: '2024-01-10T08:00:00Z',
    modified: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps customerId to id string', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('88')
  })

  it('maps email, firstName, lastName', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('user@centra.se')
    expect(result.firstName).toBe('Anna')
    expect(result.lastName).toBe('Andersson')
  })

  it('maps phoneNumber to phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.phone).toBe('+46701234567')
  })

  it('maps newsletter flag to acceptsMarketing', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.acceptsMarketing).toBe(true)
  })

  it('maps address fields from flat customer object', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.defaultAddress?.line1).toBe('Kungsgatan 1')
    expect(result.defaultAddress?.city).toBe('Stockholm')
    expect(result.defaultAddress?.postalCode).toBe('11122')
    expect(result.defaultAddress?.country).toBe('SE')
  })

  it('returns undefined defaultAddress when no address fields set', () => {
    const result = transformCustomer(
      makeCustomer({
        address1: null,
        address2: null,
        city: null,
        zipCode: null,
        country: null,
      }),
    )
    expect(result.defaultAddress).toBeUndefined()
  })

  it('maps created to createdAt (toIsoDatetime normalizes to .000Z form)', () => {
    const result = transformCustomer(makeCustomer())
    // toIsoDatetime converts via new Date().toISOString() which emits .000Z milliseconds
    expect(result.createdAt).toBe('2024-01-10T08:00:00.000Z')
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCustomer', () => {
    const canonical = transformCustomer(makeCustomer())
    const raw = untransformCustomer(canonical)
    expect(raw.email).toBe('user@centra.se')
    expect(raw.firstName).toBe('Anna')
    expect(raw.newsletter).toBe(true)
  })
})
