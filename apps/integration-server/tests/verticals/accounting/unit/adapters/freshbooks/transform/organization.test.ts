import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type FreshBooksBusiness,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/organization'

function makeBusiness(overrides: Partial<FreshBooksBusiness> = {}): FreshBooksBusiness {
  return {
    id: 500,
    name: 'Acme Inc',
    account_id: 'ACC-123',
    business_uuid: 'uuid-abc-123',
    address: {
      street: '100 Business Blvd',
      city: 'Metropolis',
      province: 'NY',
      country: 'US',
      postal_code: '10001',
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps name correctly', () => {
    expect(transformOrganization(makeBusiness()).name).toBe('Acme Inc')
  })

  it('maps address street to address1', () => {
    expect(transformOrganization(makeBusiness()).address?.address1).toBe('100 Business Blvd')
  })

  it('maps address city correctly', () => {
    expect(transformOrganization(makeBusiness()).address?.city).toBe('Metropolis')
  })

  it('maps address postal_code to postalCode', () => {
    expect(transformOrganization(makeBusiness()).address?.postalCode).toBe('10001')
  })

  it('maps address country correctly', () => {
    expect(transformOrganization(makeBusiness()).address?.country).toBe('US')
  })

  it('returns undefined address when address field is absent', () => {
    const result = transformOrganization(makeBusiness({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBusiness()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeBusiness())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
