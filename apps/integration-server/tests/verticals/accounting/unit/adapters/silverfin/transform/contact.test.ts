import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type SilverfinContact } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/contact'

function makeContact(overrides: Partial<SilverfinContact> = {}): SilverfinContact {
  return {
    id: '77',
    name: 'Acme Corp',
    company_number: 'BE0123456789',
    vat_number: 'BE0123456789',
    email: 'info@acme.com',
    phone: '+32 2 123 45 67',
    address: 'Rue de la Loi 1',
    city: 'Brussels',
    postal_code: '1000',
    country: 'BE',
    is_client: true,
    is_supplier: false,
    ...overrides,
  }
}

describe('transformContact (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('77')
    expect(result.name).toBe('Acme Corp')
    expect(result.identification).toBe('BE0123456789')
    expect(result.taxNumber).toBe('BE0123456789')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email to work email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@acme.com')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone to work telephone', () => {
    const result = transformContact(makeContact())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('+32 2 123 45 67')
    expect(result.telephones![0].type).toBe('WORK')
  })

  it('maps billing address', () => {
    const result = transformContact(makeContact())
    expect(result.billingAddress?.address1).toBe('Rue de la Loi 1')
    expect(result.billingAddress?.city).toBe('Brussels')
    expect(result.billingAddress?.postalCode).toBe('1000')
    expect(result.billingAddress?.country).toBe('BE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps is_supplier flag', () => {
    const result = transformContact(makeContact({ is_client: false, is_supplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
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
