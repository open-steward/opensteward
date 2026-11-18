import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type PeakAccountContact } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/contact'

function makeContact(overrides: Partial<PeakAccountContact> = {}): PeakAccountContact {
  return {
    id: 'CUST-001',
    name: 'Thai Company Ltd',
    type: 'customer',
    email: 'info@thaicompany.co.th',
    phone: '+66 2 000 0000',
    address: '123 Sukhumvit Rd',
    province: 'Bangkok',
    country: 'TH',
    taxId: '1234567890123',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('CUST-001')
    expect(result.name).toBe('Thai Company Ltd')
    expect(result.identification).toBe('1234567890123')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps customer type correctly', () => {
    const result = transformContact(makeContact({ type: 'customer' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps supplier type correctly', () => {
    const result = transformContact(makeContact({ type: 'supplier' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@thaicompany.co.th')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+66 2 000 0000')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address fields', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('123 Sukhumvit Rd')
    expect(result.billingAddress?.region).toBe('Bangkok')
    expect(result.billingAddress?.country).toBe('TH')
  })

  it('returns undefined emails when email is empty', () => {
    const result = transformContact(makeContact({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
