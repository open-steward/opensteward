import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type InvoiceqOrganization } from '../../../../../../../src/verticals/accounting/adapters/invoiceq/transform/organization'

function makeRaw(overrides: Partial<InvoiceqOrganization> = {}): InvoiceqOrganization {
  return {
    id: 'org1',
    name: 'Gulf Ventures LLC',
    email: 'admin@gulfventures.qa',
    phone: '+97444555666',
    address: '1 Finance Street, Doha',
    tax_number: 'QA555666777',
    currency_code: 'QAR',
    ...overrides,
  }
}

describe('transformOrganization (invoiceq)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.id).toBe('org1')
    expect(result.name).toBe('Gulf Ventures LLC')
    expect(result.legalName).toBe('Gulf Ventures LLC')
    expect(result.taxNumber).toBe('QA555666777')
    expect(result.currency).toBe('QAR')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('sets legalName equal to name', () => {
    const result = transformOrganization(makeRaw({ name: 'Renamed Co' }))
    expect(result.name).toBe('Renamed Co')
    expect(result.legalName).toBe('Renamed Co')
  })

  it('maps address field', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address).toBeDefined()
  })

  it('handles missing id gracefully', () => {
    const result = transformOrganization(makeRaw({ id: undefined }))
    expect(result.id).toBeUndefined()
  })

  it('handles missing address gracefully', () => {
    const result = transformOrganization(makeRaw({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformOrganization({})
    expect(result.id).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(result.taxNumber).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('maps currency_code correctly', () => {
    const result = transformOrganization(makeRaw({ currency_code: 'KWD' }))
    expect(result.currency).toBe('KWD')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
