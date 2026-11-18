import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type UnimicroOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/unimicro/transform/organization'

function makeOrganization(overrides: Partial<UnimicroOrganization> = {}): UnimicroOrganization {
  return {
    ID: 1,
    CompanyName: 'My Company AS',
    OrganizationNumber: '987654321',
    ...overrides,
  }
}

describe('transformOrganization (Unimicro)', () => {
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
