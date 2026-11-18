import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type MybillbookBusiness,
} from '../../../../../../../src/verticals/accounting/adapters/mybillbook/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<MybillbookBusiness> = {}): MybillbookBusiness {
  return {
    id: 'biz-001',
    business_name: 'MyBillBook Demo Co',
    legal_name: 'MyBillBook Demo Co Private Limited',
    gstin: '27AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    email: 'info@demo.com',
    phone: '+91-9876543210',
    address: '10 Commerce St',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    country: 'IN',
    currency: 'INR',
    financial_year_start: 4,
    timezone: 'Asia/Kolkata',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrganization (mybillbook)', () => {
  it('maps id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('biz-001')
  })

  it('maps business_name to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('MyBillBook Demo Co')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeRaw()).legalName).toBe('MyBillBook Demo Co Private Limited')
  })

  it('maps gstin to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('27AAAAA0000A1Z5')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('INR')
  })

  it('maps timezone', () => {
    expect(transformOrganization(makeRaw()).timezone).toBe('Asia/Kolkata')
  })

  it('computes fiscalYearEndMonth from financial_year_start=4 → 3', () => {
    // start month 4 (April) → end month = ((4-1+11) % 12) + 1 = 14 % 12 + 1 = 2 + 1 = 3 (March)
    expect(transformOrganization(makeRaw({ financial_year_start: 4 })).fiscalYearEndMonth).toBe(3)
  })

  it('computes fiscalYearEndMonth from financial_year_start=1 → 12', () => {
    // start=1 → ((1-1+11)%12)+1 = (11%12)+1 = 11+1 = 12
    expect(transformOrganization(makeRaw({ financial_year_start: 1 })).fiscalYearEndMonth).toBe(12)
  })

  it('maps address city', () => {
    expect(transformOrganization(makeRaw()).address?.city).toBe('Bengaluru')
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })
})
