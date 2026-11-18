import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type BukkuCompany,
} from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/organization'

function makeCompany(overrides: Partial<BukkuCompany> = {}): BukkuCompany {
  return {
    id: 42,
    name: 'Bukku Sdn Bhd',
    legal_name: 'Bukku Technologies Sdn Bhd',
    email: 'hello@bukku.com',
    phone: '03-12345678',
    tax_number: 'GST-000111',
    address_line_1: '10 Jalan Satu',
    address_line_2: 'Suite 200',
    city: 'Kuala Lumpur',
    postcode: '50000',
    state: 'Wilayah Persekutuan',
    country: 'MY',
    currency_code: 'MYR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps name to name', () => {
    expect(transformOrganization(makeCompany()).name).toBe('Bukku Sdn Bhd')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeCompany()).legalName).toBe('Bukku Technologies Sdn Bhd')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformOrganization(makeCompany()).taxNumber).toBe('GST-000111')
  })

  it('maps currency_code to currency', () => {
    expect(transformOrganization(makeCompany()).currency).toBe('MYR')
  })

  it('maps address fields correctly', () => {
    const result = transformOrganization(makeCompany())
    expect(result.address?.address1).toBe('10 Jalan Satu')
    expect(result.address?.address2).toBe('Suite 200')
    expect(result.address?.city).toBe('Kuala Lumpur')
    expect(result.address?.postalCode).toBe('50000')
    expect(result.address?.region).toBe('Wilayah Persekutuan')
    expect(result.address?.country).toBe('MY')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCompany()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCompany())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
