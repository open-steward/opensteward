import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type ContaOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/conta/transform/organization'

function makeOrganization(overrides: Partial<ContaOrganization> = {}): ContaOrganization {
  return {
    id: 'org-1',
    name: 'My Company AS',
    org_number: '987654321',
    vat_number: 'NO987654321MVA',
    ...overrides,
  }
}

describe('transformOrganization (Conta)', () => {
  it('maps legal name and tax number', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.name).toBe('My Company AS')
    expect(result.legalName).toBe('My Company AS')
    expect(result.taxNumber).toBe('987654321')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
