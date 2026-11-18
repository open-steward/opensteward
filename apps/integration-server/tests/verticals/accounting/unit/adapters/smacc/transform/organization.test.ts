import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type SmaccCompany } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/organization'

function makeRaw(overrides: Partial<SmaccCompany> = {}): SmaccCompany {
  return {
    id: 'org-1',
    name: 'Smacc GmbH',
    tax_number: 'TAX-001',
    vat_number: 'DE999888777',
    email: 'info@smacc.de',
    phone: '+49303030',
    street: 'Unter den Linden 1',
    city: 'Berlin',
    zip: '10117',
    country: 'DE',
    currency: 'EUR',
    ...overrides,
  }
}

describe('smacc transformOrganization', () => {
  it('maps id to id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('org-1')
  })

  it('maps name to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Smacc GmbH')
  })

  it('maps vat_number to taxNumber (preferred over tax_number)', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('DE999888777')
  })

  it('falls back to tax_number when vat_number absent', () => {
    expect(transformOrganization(makeRaw({ vat_number: undefined })).taxNumber).toBe('TAX-001')
  })

  it('maps currency to currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('EUR')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrganization(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
