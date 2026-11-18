import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type VosFacturesClient,
} from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeClient(overrides: Partial<VosFacturesClient> = {}): VosFacturesClient {
  return {
    id: 50,
    name: 'Acme Corp',
    company: true,
    tax_no: 'PL1234567890',
    street: 'ul. Marszałkowska 10',
    post_code: '00-001',
    city: 'Warsaw',
    country: 'PL',
    email: 'contact@acme.pl',
    phone: '+48221234567',
    mobile_phone: '+48501234567',
    created_at: '2024-01-05T00:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeClient())
    expect(result.id).toBe('50')
    expect(result.companyName).toBe('Acme Corp')
    expect(result.taxNumber).toBe('PL1234567890')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('always sets isCustomer=true', () => {
    const result = transformContact(makeClient({ company: false }))
    expect(result.isCustomer).toBe(true)
  })

  it('maps email to WORK type', () => {
    const result = transformContact(makeClient())
    expect(result.emails![0].email).toBe('contact@acme.pl')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone as WORK and mobile_phone as MOBILE', () => {
    const result = transformContact(makeClient())
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0].type).toBe('WORK')
    expect(result.telephones![1].type).toBe('MOBILE')
  })

  it('handles individual contact (company=false)', () => {
    const result = transformContact(
      makeClient({ company: false, first_name: 'Jan', last_name: 'Kowalski', name: undefined }),
    )
    expect(result.firstName).toBe('Jan')
    expect(result.lastName).toBe('Kowalski')
    expect(result.companyName).toBeUndefined()
  })

  it('maps billing address', () => {
    const result = transformContact(makeClient())
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress!.city).toBe('Warsaw')
    expect(result.billingAddress!.postalCode).toBe('00-001')
    expect(result.billingAddress!.country).toBe('PL')
  })

  it('parses dates as Date objects', () => {
    const result = transformContact(makeClient())
    expect(result.createdAt).toEqual(new Date('2024-01-05T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
  })

  it('passes raw as metadata', () => {
    const raw = makeClient()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformContact(makeClient())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
