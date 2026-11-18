import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type PuzzleCompany,
} from '../../../../../../../src/verticals/accounting/adapters/puzzle/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<PuzzleCompany> = {}): PuzzleCompany {
  return {
    id: 'comp-pzl-1',
    name: 'Puzzle Startup Inc',
    reportingCurrency: 'USD',
    financialYearStartDate: '2025-01-01',
    status: 'Ready',
    ...overrides,
  }
}

describe('puzzle transformOrganization', () => {
  it('maps id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('comp-pzl-1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Puzzle Startup Inc')
  })

  it('maps reportingCurrency to currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('USD')
  })

  it('derives fiscalYearEndMonth as 12 when year starts in January', () => {
    // January start (month 1) → end month = 12
    expect(
      transformOrganization(makeRaw({ financialYearStartDate: '2025-01-01' })).fiscalYearEndMonth,
    ).toBe(12)
  })

  it('derives fiscalYearEndMonth as 5 when year starts in June', () => {
    // June start (month 6) → end month = 5
    expect(
      transformOrganization(makeRaw({ financialYearStartDate: '2025-06-01' })).fiscalYearEndMonth,
    ).toBe(5)
  })

  it('leaves fiscalYearEndMonth undefined when financialYearStartDate absent', () => {
    expect(
      transformOrganization(makeRaw({ financialYearStartDate: undefined })).fiscalYearEndMonth,
    ).toBeUndefined()
  })

  it('passes OrganizationSchema.parse', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeRaw()))).not.toThrow()
  })
})
