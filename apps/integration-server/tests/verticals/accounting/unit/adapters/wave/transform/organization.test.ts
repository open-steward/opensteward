import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type WaveOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/wave/transform/organization'

function makeOrganization(overrides: Partial<WaveOrganization> = {}): WaveOrganization {
  return {
    id: 'org-001',
    name: 'Acme Corp',
    currency: { code: 'CAD' },
    address: {
      addressLine1: '123 Main St',
      city: 'Toronto',
      province: { code: 'ON' },
      postalCode: 'M5V 1A1',
      country: { code: 'CA' },
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme Corp')
  })

  it('maps currency.code to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('CAD')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('123 Main St')
    expect(o.address?.city).toBe('Toronto')
    expect(o.address?.region).toBe('ON')
    expect(o.address?.postalCode).toBe('M5V 1A1')
    expect(o.address?.country).toBe('CA')
  })

  it('returns undefined address when address is null', () => {
    expect(transformOrganization(makeOrganization({ address: null })).address).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined currency when currency is null', () => {
    expect(
      transformOrganization(makeOrganization({ currency: null })).currency,
    ).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
