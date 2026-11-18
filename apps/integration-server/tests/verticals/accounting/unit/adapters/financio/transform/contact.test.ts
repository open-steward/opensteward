import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type FinancioContact } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/contact'

function makeRaw(overrides: Partial<FinancioContact> = {}): FinancioContact {
  return {
    id: '11',
    name: 'Acme Pte Ltd',
    email: 'admin@acme.sg',
    phone: '+6591234567',
    address: '1 Marina Boulevard',
    city: 'Singapore',
    postcode: '018989',
    state: '',
    country: 'SG',
    is_customer: true,
    is_supplier: false,
    currency_code: 'SGD',
    reg_no: '201234567K',
    tax_no: 'GST-123456',
    credit_limit: 10000,
    is_active: true,
    ...overrides,
  }
}

describe('transformContact (financio)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('11')
    expect(result.name).toBe('Acme Pte Ltd')
    expect(result.identification).toBe('201234567K')
    expect(result.taxNumber).toBe('GST-123456')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('SGD')
  })

  it('maps email to work email', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('admin@acme.sg')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+6591234567')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('1 Marina Boulevard')
    expect(result.billingAddress?.city).toBe('Singapore')
    expect(result.billingAddress?.postalCode).toBe('018989')
    expect(result.billingAddress?.country).toBe('SG')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ name: 'Test Corp' })
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['name']).toBe('Test Corp')
  })

  it('handles supplier-only flag', () => {
    const result = transformContact(makeRaw({ is_customer: false, is_supplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('returns undefined emails when email is empty', () => {
    const result = transformContact(makeRaw({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
