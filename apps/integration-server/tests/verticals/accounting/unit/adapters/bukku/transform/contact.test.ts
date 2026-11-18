import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type BukkuContact } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/contact'

function makeRaw(overrides: Partial<BukkuContact> = {}): BukkuContact {
  return {
    id: '7',
    name: 'Acme Sdn Bhd',
    email: 'info@acme.my',
    phone: '+60312345678',
    billing_address_line_1: '123 Jalan Ampang',
    billing_address_line_2: 'Unit 5',
    billing_city: 'Kuala Lumpur',
    billing_postcode: '50450',
    billing_state: 'Kuala Lumpur',
    billing_country: 'MY',
    shipping_address_line_1: '456 Jalan Pudu',
    shipping_address_city: 'Kuala Lumpur',
    shipping_address_postcode: '50460',
    shipping_address_country: 'MY',
    is_customer: true,
    is_supplier: false,
    currency_code: 'MYR',
    tax_number: 'A1234567',
    is_active: true,
    ...overrides,
  }
}

describe('transformContact (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('7')
    expect(result.name).toBe('Acme Sdn Bhd')
    expect(result.identification).toBe('A1234567')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('MYR')
  })

  it('maps email to work email', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@acme.my')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+60312345678')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('123 Jalan Ampang')
    expect(result.billingAddress?.city).toBe('Kuala Lumpur')
    expect(result.billingAddress?.postalCode).toBe('50450')
    expect(result.billingAddress?.country).toBe('MY')
  })

  it('maps shipping address', () => {
    const result = transformContact(makeRaw())
    expect(result.shippingAddress?.address1).toBe('456 Jalan Pudu')
    expect(result.shippingAddress?.city).toBe('Kuala Lumpur')
    expect(result.shippingAddress?.postalCode).toBe('50460')
    expect(result.shippingAddress?.country).toBe('MY')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ name: 'Test Corp' })
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['name']).toBe('Test Corp')
  })

  it('handles supplier flag correctly', () => {
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
