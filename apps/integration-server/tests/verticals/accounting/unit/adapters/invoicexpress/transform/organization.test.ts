import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type InvoiceXpressOrganization } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/organization'

function makeOrganization(overrides: Partial<InvoiceXpressOrganization> = {}): InvoiceXpressOrganization {
  return {
    name: 'My Business SA',
    tax_id: 'PT500000000',
    email: 'contact@mybusiness.pt',
    phone: '+351213000000',
    address: 'Avenida Central 5, Lisboa',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('My Business SA')
    expect(result.taxNumber).toBe('PT500000000')
  })

  it('maps address correctly', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('Avenida Central 5, Lisboa')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization({ name: 'Test Org' })
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined name when empty', () => {
    const result = transformOrganization(makeOrganization({ name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('returns undefined taxNumber when tax_id is empty', () => {
    const result = transformOrganization(makeOrganization({ tax_id: '' }))
    expect(result.taxNumber).toBeUndefined()
  })

  it('returns undefined address when address is empty', () => {
    const result = transformOrganization(makeOrganization({ address: '' }))
    expect(result.address).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
