import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type MorningClient } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/contact'

function makeClient(overrides: Partial<MorningClient> = {}): MorningClient {
  return {
    id: 'client_1',
    name: 'Acme Ltd',
    type: 1,
    taxId: '123456789',
    email: 'info@acme.il',
    phone: '050-1234567',
    address: {
      city: 'Tel Aviv',
      country: 'IL',
      streetAddress: 'Dizengoff 1',
      zip: '64332',
    },
    ...overrides,
  }
}

describe('transformContact (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeClient())
    expect(result.id).toBe('client_1')
    expect(result.name).toBe('Acme Ltd')
    expect(result.identification).toBe('123456789')
    expect(result.isCustomer).toBe(true)
  })

  it('maps email correctly', () => {
    const result = transformContact(makeClient())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@acme.il')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone correctly', () => {
    const result = transformContact(makeClient())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0].telephone).toBe('050-1234567')
  })

  it('maps address correctly', () => {
    const result = transformContact(makeClient())
    expect(result.billingAddress?.city).toBe('Tel Aviv')
    expect(result.billingAddress?.country).toBe('IL')
    expect(result.billingAddress?.address1).toBe('Dizengoff 1')
    expect(result.billingAddress?.postalCode).toBe('64332')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeClient()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing email', () => {
    const result = transformContact(makeClient({ email: undefined }))
    expect(result.emails).toBeUndefined()
  })

  it('handles missing phone', () => {
    const result = transformContact(makeClient({ phone: undefined }))
    expect(result.telephones).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeClient())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
