import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type LedgerSMBCompanyInfo,
} from '../../../../../../../src/verticals/accounting/adapters/ledgersmb/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeCompanyInfo(overrides: Partial<LedgerSMBCompanyInfo> = {}): LedgerSMBCompanyInfo {
  return {
    company: 'ledgersmb_demo',
    name: 'Demo Company',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps company to organizationCode', () => {
    expect(transformOrganization(makeCompanyInfo()).organizationCode).toBe('ledgersmb_demo')
  })

  it('maps name to name', () => {
    expect(transformOrganization(makeCompanyInfo()).name).toBe('Demo Company')
  })

  it('falls back to company when name absent', () => {
    const result = transformOrganization(makeCompanyInfo({ name: undefined }))
    expect(result.name).toBe('ledgersmb_demo')
  })

  it('returns metadata as raw object', () => {
    const raw = makeCompanyInfo()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('passes schema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeCompanyInfo()))).not.toThrow()
  })
})
