import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type XledgerOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/xledger/transform/organization'

function makeOrganization(overrides: Partial<XledgerOrganization> = {}): XledgerOrganization {
  return {
    dbId: 'org-1',
    description: 'My Company AS',
    orgNo: '987654321',
    ...overrides,
  }
}

describe('transformOrganization (Xledger)', () => {
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
