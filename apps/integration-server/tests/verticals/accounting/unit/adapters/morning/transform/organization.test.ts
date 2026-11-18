import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MorningBusiness } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/organization'

function makeBusiness(overrides: Partial<MorningBusiness> = {}): MorningBusiness {
  return {
    id: 'biz_1',
    name: 'My Company Ltd',
    taxId: '987654321',
    email: 'office@myco.il',
    phone: '03-1234567',
    address: {
      city: 'Jerusalem',
      country: 'IL',
      streetAddress: 'Jaffa Road 1',
      zip: '91000',
    },
    ...overrides,
  }
}

describe('transformOrganization (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeBusiness())
    expect(result.id).toBe('biz_1')
    expect(result.name).toBe('My Company Ltd')
    expect(result.taxNumber).toBe('987654321')
  })

  it('maps address correctly', () => {
    const result = transformOrganization(makeBusiness())
    expect(result.address?.city).toBe('Jerusalem')
    expect(result.address?.country).toBe('IL')
    expect(result.address?.address1).toBe('Jaffa Road 1')
    expect(result.address?.postalCode).toBe('91000')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBusiness()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing address', () => {
    const result = transformOrganization(makeBusiness({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeBusiness())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
