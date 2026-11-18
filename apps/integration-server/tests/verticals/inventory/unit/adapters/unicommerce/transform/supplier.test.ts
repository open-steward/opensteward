import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawUnicommerceVendor,
} from '../../../../../../../src/verticals/inventory/adapters/unicommerce/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

function makeRaw(overrides: Partial<RawUnicommerceVendor> = {}): RawUnicommerceVendor {
  return {
    code: 'VENDOR-01',
    name: 'Acme Supplies Pvt Ltd',
    enabled: true,
    pan: 'AABCA1234Z',
    gstNumber: '22AABCA1234Z1Z5',
    website: 'https://acme.example.com',
    purchaseExpiryPeriod: 30,
    billingAddress: {
      addressLine1: '10 Trade Park',
      addressLine2: 'Zone B',
      city: 'Delhi',
      stateCode: 'DL',
      pincode: '110001',
      phone: '+911123456789',
    },
    partyContacts: [
      {
        contactType: 'PRIMARY',
        name: 'Rahul Kumar',
        email: 'rahul@acme.example.com',
        phone: '+919876543210',
      },
      {
        contactType: 'SECONDARY',
        name: 'Priya Singh',
        email: 'priya@acme.example.com',
        phone: '+919876543211',
      },
    ],
    ...overrides,
  }
}

describe('transformSupplier (unicommerce)', () => {
  it('maps id and externalId from code', () => {
    const result = transformSupplier(makeRaw({ code: 'VENDOR-01' }))
    expect(result.id).toBe('VENDOR-01')
    expect(result.externalId).toBe('VENDOR-01')
  })

  it('returns empty string id when code is absent', () => {
    const result = transformSupplier(makeRaw({ code: undefined }))
    expect(result.id).toBe('')
  })

  it('maps name from raw.name', () => {
    const result = transformSupplier(makeRaw({ name: 'Acme Supplies Pvt Ltd' }))
    expect(result.name).toBe('Acme Supplies Pvt Ltd')
  })

  it('falls back name to code when name is absent', () => {
    const result = transformSupplier(makeRaw({ name: undefined, code: 'VENDOR-01' }))
    expect(result.name).toBe('VENDOR-01')
  })

  it('maps email from PRIMARY partyContact', () => {
    const result = transformSupplier(makeRaw())
    expect(result.email).toBe('rahul@acme.example.com')
  })

  it('maps phone from PRIMARY partyContact (preferred over billingAddress.phone)', () => {
    const result = transformSupplier(makeRaw())
    expect(result.phone).toBe('+919876543210')
  })

  it('falls back to first contact when no PRIMARY contact exists', () => {
    const result = transformSupplier(
      makeRaw({
        partyContacts: [
          {
            contactType: 'SECONDARY',
            name: 'Priya',
            email: 'priya@acme.example.com',
            phone: '+919876543211',
          },
        ],
      }),
    )
    expect(result.email).toBe('priya@acme.example.com')
  })

  it('falls back phone to billingAddress.phone when partyContacts is absent', () => {
    const result = transformSupplier(
      makeRaw({
        partyContacts: undefined,
        billingAddress: { phone: '+911123456789' },
      }),
    )
    expect(result.phone).toBe('+911123456789')
  })

  it('email is undefined when partyContacts is empty and billingAddress has no email', () => {
    const result = transformSupplier(makeRaw({ partyContacts: [] }))
    expect(result.email).toBeUndefined()
  })

  it('isActive is true when enabled is true', () => {
    expect(transformSupplier(makeRaw({ enabled: true })).isActive).toBe(true)
  })

  it('isActive is false when enabled is false', () => {
    expect(transformSupplier(makeRaw({ enabled: false })).isActive).toBe(false)
  })

  it('isActive defaults to true when enabled is absent', () => {
    expect(transformSupplier(makeRaw({ enabled: undefined })).isActive).toBe(true)
  })

  it('does not set defaultCurrency or defaultLeadTimeDays (not provided by unicommerce)', () => {
    const result = transformSupplier(makeRaw())
    expect(result.defaultCurrency).toBeUndefined()
    expect(result.defaultLeadTimeDays).toBeUndefined()
  })

  it('platform is "unicommerce"', () => {
    expect(transformSupplier(makeRaw()).platform).toBe('unicommerce')
  })

  it('passes SupplierSchema validation', () => {
    const result = transformSupplier(makeRaw())
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
