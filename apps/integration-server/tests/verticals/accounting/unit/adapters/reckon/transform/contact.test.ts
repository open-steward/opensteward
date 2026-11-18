import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ReckonContact } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/contact'

function makeRaw(overrides: Partial<ReckonContact> = {}): ReckonContact {
  return {
    id: 'contact-001',
    displayName: 'Acme Pty Ltd',
    firstName: 'John',
    lastName: 'Doe',
    companyName: 'Acme Pty Ltd',
    email: 'john@acme.com',
    phone: '0298765432',
    mobile: '0400123456',
    fax: '0298765433',
    abn: '12345678901',
    isCustomer: true,
    isSupplier: false,
    currencyCode: 'AUD',
    isActive: true,
    billingAddress: {
      address: '100 George St',
      city: 'Sydney',
      state: 'NSW',
      postCode: '2000',
      country: 'AU',
    },
    shippingAddress: null,
    ...overrides,
  }
}

describe('transformContact (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('contact-001')
    expect(result.name).toBe('Acme Pty Ltd')
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Doe')
    expect(result.companyName).toBe('Acme Pty Ltd')
    expect(result.identification).toBe('12345678901')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('AUD')
  })

  it('maps email as work email', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('john@acme.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone numbers with correct types', () => {
    const result = transformContact(makeRaw())
    const tels = result.telephones!
    expect(tels.some((t) => t.telephone === '0298765432' && t.type === 'WORK')).toBe(true)
    expect(tels.some((t) => t.telephone === '0400123456' && t.type === 'MOBILE')).toBe(true)
    expect(tels.some((t) => t.telephone === '0298765433' && t.type === 'FAX')).toBe(true)
  })

  it('maps billing address', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('100 George St')
    expect(result.billingAddress?.city).toBe('Sydney')
    expect(result.billingAddress?.region).toBe('NSW')
    expect(result.billingAddress?.postalCode).toBe('2000')
    expect(result.billingAddress?.country).toBe('AU')
  })

  it('omits shippingAddress when null', () => {
    const result = transformContact(makeRaw({ shippingAddress: null }))
    expect(result.shippingAddress).toBeUndefined()
  })

  it('maps shippingAddress when present', () => {
    const result = transformContact(
      makeRaw({
        shippingAddress: {
          address: '200 Pitt St',
          city: 'Sydney',
          state: 'NSW',
          postCode: '2000',
          country: 'AU',
        },
      }),
    )
    expect(result.shippingAddress?.address1).toBe('200 Pitt St')
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
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
