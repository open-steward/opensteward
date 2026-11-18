import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type GiddhAccount,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/contact'

function makeRaw(overrides: Partial<GiddhAccount> = {}): GiddhAccount {
  return {
    uniqueName: 'customer-abc-pvt',
    name: 'ABC Pvt Ltd',
    type: 'SUNDRYDEBTORS',
    email: 'contact@abc.com',
    mobileNo: '+919876543210',
    phone: '0221234567',
    country: 'India',
    state: 'Maharashtra',
    pincode: '400001',
    address: '123 MG Road, Mumbai',
    isActive: true,
    currency: 'INR',
    ...overrides,
  }
}

describe('transformContact (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('customer-abc-pvt')
    expect(result.name).toBe('ABC Pvt Ltd')
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('INR')
  })

  it('maps SUNDRYDEBTORS to isCustomer=true', () => {
    const result = transformContact(makeRaw({ type: 'SUNDRYDEBTORS' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps SUNDRYCREDITORS to isSupplier=true', () => {
    const result = transformContact(makeRaw({ type: 'SUNDRYCREDITORS' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('contact@abc.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps mobileNo to MOBILE telephone', () => {
    const result = transformContact(makeRaw())
    const mobile = result.telephones?.find((t) => t.type === 'MOBILE')
    expect(mobile?.telephone).toBe('+919876543210')
  })

  it('maps phone to WORK telephone', () => {
    const result = transformContact(makeRaw())
    const work = result.telephones?.find((t) => t.type === 'WORK')
    expect(work?.telephone).toBe('0221234567')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined emails when email is empty', () => {
    const result = transformContact(makeRaw({ email: '' }))
    expect(result.emails).toBeUndefined()
  })

  it('normalises country to ISO alpha-2', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.country).toBe('IN')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
