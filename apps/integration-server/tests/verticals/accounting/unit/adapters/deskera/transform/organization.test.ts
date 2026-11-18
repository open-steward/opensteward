import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type DeskeraOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/organization'

function makeOrganization(overrides: Partial<DeskeraOrganization> = {}): DeskeraOrganization {
  return {
    id: 'desk-org-1',
    name: 'Deskera Pte Ltd',
    legalName: 'Deskera Legal Pte Ltd',
    email: 'admin@deskera.com',
    phone: '+65-12345678',
    website: 'https://deskera.com',
    currency: 'SGD',
    taxNumber: 'SG-TAX-99999',
    address: {
      address1: '6 Shenton Way',
      address2: '#10-01',
      city: 'Singapore',
      state: 'Singapore',
      country: 'SG',
      postalCode: '068809',
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps name to name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Deskera Pte Ltd')
  })

  it('maps legalName to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Deskera Legal Pte Ltd')
  })

  it('falls back to name when legalName is absent', () => {
    const result = transformOrganization(makeOrganization({ legalName: undefined }))
    expect(result.legalName).toBe('Deskera Pte Ltd')
  })

  it('maps taxNumber to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('SG-TAX-99999')
  })

  it('maps currency to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('SGD')
  })

  it('maps website to website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://deskera.com')
  })

  it('maps nested address fields', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('6 Shenton Way')
    expect(result.address?.address2).toBe('#10-01')
    expect(result.address?.city).toBe('Singapore')
    expect(result.address?.postalCode).toBe('068809')
    expect(result.address?.country).toBe('SG')
  })

  it('omits address when raw.address is absent', () => {
    const result = transformOrganization(makeOrganization({ address: undefined }))
    expect(result.address).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
