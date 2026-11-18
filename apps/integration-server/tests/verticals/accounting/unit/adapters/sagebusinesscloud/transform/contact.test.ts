import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type SageContact } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/contact'

function makeRaw(overrides: Partial<SageContact> = {}): SageContact {
  return {
    id: 'CONTACT-001',
    name: 'Acme Ltd',
    email: 'info@acme.co.uk',
    mobile: '+447911123456',
    phone: '+442071234567',
    main_address: {
      address_line_1: '123 High Street',
      city: 'London',
      postal_code: 'EC1A 1BB',
      region: 'England',
      country: { id: 'GB' },
    },
    is_customer: true,
    is_supplier: false,
    ...overrides,
  }
}

describe('transformContact (SageBusinessCloud)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('CONTACT-001')
    expect(result.name).toBe('Acme Ltd')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@acme.co.uk')
  })

  it('maps phone and mobile to telephones', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toHaveLength(2)
    const types = result.telephones!.map((t) => t.type)
    expect(types).toContain('WORK')
    expect(types).toContain('MOBILE')
  })

  it('maps billing address correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress?.address1).toBe('123 High Street')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.postalCode).toBe('EC1A 1BB')
    expect(result.billingAddress?.country).toBe('GB')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('maps supplier correctly', () => {
    const result = transformContact(makeRaw({ is_customer: false, is_supplier: true }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
