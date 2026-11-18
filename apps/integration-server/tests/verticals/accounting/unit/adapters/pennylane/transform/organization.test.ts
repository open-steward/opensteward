import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type PennylaneOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/organization'

function makeOrganization(overrides: Partial<PennylaneOrganization> = {}): PennylaneOrganization {
  return {
    id: 'org-1',
    name: 'Pennylane Demo SAS',
    legal_registration_number: '123456789',
    vat_number: 'FR00123456789',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id correctly', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-1')
  })

  it('maps name correctly', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Pennylane Demo SAS')
  })

  it('maps name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Pennylane Demo SAS')
  })

  it('maps vat_number to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('FR00123456789')
  })

  it('maps legal_registration_number to organizationCode', () => {
    expect(transformOrganization(makeOrganization()).organizationCode).toBe('123456789')
  })

  it('maps currency correctly', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('EUR')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
