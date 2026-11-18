import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type SaldeoCompany,
} from '../../../../../../../src/verticals/accounting/adapters/saldeo/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeCompany(overrides: Partial<SaldeoCompany> = {}): SaldeoCompany {
  return {
    COMPANY_ID: '42',
    COMPANY_PROGRAM_ID: 'acme-2024',
    NAME: 'Acme Sp. z o.o.',
    NIP: 'PL9876543210',
    _raw: '<COMPANY><COMPANY_ID>42</COMPANY_ID></COMPANY>',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps COMPANY_PROGRAM_ID as id (preferred over COMPANY_ID)', () => {
    const result = transformOrganization(makeCompany())
    expect(result.id).toBe('acme-2024')
  })

  it('falls back to COMPANY_ID as id when COMPANY_PROGRAM_ID is absent', () => {
    const result = transformOrganization(makeCompany({ COMPANY_PROGRAM_ID: undefined }))
    expect(result.id).toBe('42')
  })

  it('returns undefined id when both COMPANY_PROGRAM_ID and COMPANY_ID are absent', () => {
    const result = transformOrganization(
      makeCompany({ COMPANY_PROGRAM_ID: undefined, COMPANY_ID: undefined }),
    )
    expect(result.id).toBeUndefined()
  })

  it('maps NAME to name', () => {
    const result = transformOrganization(makeCompany())
    expect(result.name).toBe('Acme Sp. z o.o.')
  })

  it('maps NAME to legalName', () => {
    const result = transformOrganization(makeCompany())
    expect(result.legalName).toBe('Acme Sp. z o.o.')
  })

  it('maps COMPANY_PROGRAM_ID to organizationCode', () => {
    const result = transformOrganization(makeCompany())
    expect(result.organizationCode).toBe('acme-2024')
  })

  it('returns undefined organizationCode when COMPANY_PROGRAM_ID is absent', () => {
    const result = transformOrganization(makeCompany({ COMPANY_PROGRAM_ID: undefined }))
    expect(result.organizationCode).toBeUndefined()
  })

  it('maps NIP to taxNumber', () => {
    const result = transformOrganization(makeCompany())
    expect(result.taxNumber).toBe('PL9876543210')
  })

  it('returns undefined taxNumber when NIP is absent', () => {
    const result = transformOrganization(makeCompany({ NIP: undefined }))
    expect(result.taxNumber).toBeUndefined()
  })

  it('returns undefined name when NAME is absent', () => {
    const result = transformOrganization(makeCompany({ NAME: undefined }))
    expect(result.name).toBeUndefined()
    expect(result.legalName).toBeUndefined()
  })

  it('maps metadata to { _xml: raw._raw } — not the whole company object', () => {
    const raw = makeCompany()
    const result = transformOrganization(raw)
    expect(result.metadata).toEqual({ _xml: raw._raw })
  })

  it('passes schema validation', () => {
    const result = transformOrganization(makeCompany())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })

  it('passes schema validation with minimal fields', () => {
    const result = transformOrganization(
      makeCompany({
        COMPANY_PROGRAM_ID: undefined,
        COMPANY_ID: undefined,
        NAME: undefined,
        NIP: undefined,
      }),
    )
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
