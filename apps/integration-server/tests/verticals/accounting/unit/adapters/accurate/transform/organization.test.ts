import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type AccurateCompany } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/organization'

function makeCompany(overrides: Partial<AccurateCompany> = {}): AccurateCompany {
  return {
    id: 1,
    name: 'PT Accurate Indonesia',
    taxId: '01.999.888.7-000.000',
    address: 'Jl. Raya Bogor KM. 28',
    email: 'info@accurate.id',
    phone: '+6221-8700-8888',
    ...overrides,
  }
}

describe('transformOrganization (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeCompany())
    expect(result.id).toBe('1')
    expect(result.name).toBe('PT Accurate Indonesia')
    expect(result.taxNumber).toBe('01.999.888.7-000.000')
  })

  it('maps address', () => {
    const result = transformOrganization(makeCompany())
    expect(result.address?.address1).toBe('Jl. Raya Bogor KM. 28')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCompany()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles null taxId', () => {
    const result = transformOrganization(makeCompany({ taxId: null }))
    expect(result.taxNumber).toBeUndefined()
  })

  it('handles null address', () => {
    const result = transformOrganization(makeCompany({ address: null }))
    expect(result.address).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCompany())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
