import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type ClearOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/organization'

function makeOrganization(overrides: Partial<ClearOrganization> = {}): ClearOrganization {
  return {
    id: 'org-001',
    name: 'Clear Pvt Ltd',
    trade_name: 'Clear Finance',
    gstin: 'GSTIN123456',
    pan: 'ABCDE1234F',
    email: 'info@clear.in',
    phone: '+91-9876543210',
    address_line1: '5th Floor, Tower B',
    address_line2: 'Embassy Tech Village',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560103',
    country: 'IN',
    currency: 'INR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id to id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name to name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Clear Pvt Ltd')
  })

  it('maps trade_name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Clear Finance')
  })

  it('falls back to name when trade_name is empty', () => {
    const result = transformOrganization(makeOrganization({ trade_name: '' }))
    expect(result.legalName).toBe('Clear Pvt Ltd')
  })

  it('maps gstin to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('GSTIN123456')
  })

  it('maps pan to organizationCode', () => {
    expect(transformOrganization(makeOrganization()).organizationCode).toBe('ABCDE1234F')
  })

  it('maps currency to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('INR')
  })

  it('maps address fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('5th Floor, Tower B')
    expect(result.address?.address2).toBe('Embassy Tech Village')
    expect(result.address?.city).toBe('Bengaluru')
    expect(result.address?.region).toBe('Karnataka')
    expect(result.address?.postalCode).toBe('560103')
    expect(result.address?.country).toBe('IN')
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
