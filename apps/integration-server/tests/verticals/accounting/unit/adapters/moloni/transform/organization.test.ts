import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type MoloniOrganization } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/organization'

function makeOrganization(overrides: Partial<MoloniOrganization> = {}): MoloniOrganization {
  return {
    company_id: 1,
    name: 'My Company Lda',
    vat: 'PT500123456',
    address: 'Avenida da República 10',
    email: 'geral@mycompany.pt',
    phone: '+351213000000',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.id).toBe('1')
    expect(result.name).toBe('My Company Lda')
    expect(result.taxNumber).toBe('PT500123456')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization({ name: 'Test Org' })
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps address correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Avenida da República 10')
  })

  it('returns undefined name when empty', () => {
    const result = transformOrganization(makeOrganization({ name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('returns undefined taxNumber when vat is empty', () => {
    const result = transformOrganization(makeOrganization({ vat: '' }))
    expect(result.taxNumber).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
