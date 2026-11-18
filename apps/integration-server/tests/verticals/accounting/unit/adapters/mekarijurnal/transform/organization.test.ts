import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MekariJurnalCompany } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/organization'

function makeCompany(overrides: Partial<MekariJurnalCompany> = {}): MekariJurnalCompany {
  return {
    id: 1,
    company_name: 'PT Contoh Indonesia',
    address: 'Jl. Gatot Subroto No. 10',
    email: 'info@contoh.co.id',
    phone: '+6221-5555-1234',
    ...overrides,
  }
}

describe('transformOrganization (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeCompany())
    expect(result.id).toBe('1')
    expect(result.name).toBe('PT Contoh Indonesia')
  })

  it('maps address', () => {
    const result = transformOrganization(makeCompany())
    expect(result.address?.address1).toBe('Jl. Gatot Subroto No. 10')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCompany()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
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
