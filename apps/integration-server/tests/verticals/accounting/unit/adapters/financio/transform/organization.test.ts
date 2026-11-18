import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type FinancioCompany,
} from '../../../../../../../src/verticals/accounting/adapters/financio/transform/organization'

function makeCompany(overrides: Partial<FinancioCompany> = {}): FinancioCompany {
  return {
    id: 'fin-1',
    company_name: 'Financio Corp',
    registration_no: 'REG-001',
    email: 'info@financio.com',
    phone: '+60-123456789',
    address: '10 Business Park',
    city: 'Kuala Lumpur',
    postcode: '50000',
    state: 'Wilayah Persekutuan',
    country: 'MY',
    currency_code: 'MYR',
    gst_registered: true,
    gst_no: 'GST-001234',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps company_name to name and legalName', () => {
    const result = transformOrganization(makeCompany())
    expect(result.name).toBe('Financio Corp')
    expect(result.legalName).toBe('Financio Corp')
  })

  it('maps gst_no to taxNumber when present', () => {
    const result = transformOrganization(makeCompany())
    expect(result.taxNumber).toBe('GST-001234')
  })

  it('falls back to registration_no when gst_no is empty', () => {
    const result = transformOrganization(makeCompany({ gst_no: '', gst_registered: false }))
    expect(result.taxNumber).toBe('REG-001')
  })

  it('maps currency_code to currency', () => {
    const result = transformOrganization(makeCompany())
    expect(result.currency).toBe('MYR')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeCompany())
    expect(result.address?.address1).toBe('10 Business Park')
    expect(result.address?.city).toBe('Kuala Lumpur')
    expect(result.address?.postalCode).toBe('50000')
    expect(result.address?.region).toBe('Wilayah Persekutuan')
    expect(result.address?.country).toBe('MY')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeCompany()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCompany())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
