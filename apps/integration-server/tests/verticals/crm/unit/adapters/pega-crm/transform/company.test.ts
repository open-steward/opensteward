import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawPegaAccount,
} from '../../../../../../../src/verticals/crm/adapters/pega-crm/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawPegaAccount> = {}): RawPegaAccount {
  return {
    pyID: 'ACCT-7',
    AccountName: 'Acme Corp',
    Website: 'acme.example',
    Phone: '+14155550123',
    NumberOfEmployees: '350',
    Industry: 'Manufacturing',
    pxCreateDateTime: '20260115T093000.000 GMT',
    pxUpdateDateTime: '20260120T120000.000 GMT',
    ...overrides,
  }
}

describe('pega-crm transformCompany', () => {
  it('maps id from pyID', () => {
    expect(transformCompany(makeRaw()).id).toBe('ACCT-7')
  })

  it('falls back to pyGUID when pyID is absent', () => {
    expect(transformCompany(makeRaw({ pyID: undefined, pyGUID: 'GUID-1' })).id).toBe('GUID-1')
  })

  it('maps name from AccountName', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Corp')
  })

  it('falls back to Name when AccountName is absent', () => {
    expect(transformCompany(makeRaw({ AccountName: undefined, Name: 'Fallback Corp' })).name).toBe(
      'Fallback Corp',
    )
  })

  it('maps domain from Website', () => {
    expect(transformCompany(makeRaw()).domain).toBe('acme.example')
  })

  it('maps phone from Phone', () => {
    expect(transformCompany(makeRaw()).phone).toBe('+14155550123')
  })

  it('maps size from NumberOfEmployees string', () => {
    expect(transformCompany(makeRaw()).size).toBe(350)
  })

  it('maps size from NumberOfEmployees number', () => {
    expect(transformCompany(makeRaw({ NumberOfEmployees: 120 })).size).toBe(120)
  })

  it('sets size to undefined when NumberOfEmployees is absent', () => {
    expect(transformCompany(makeRaw({ NumberOfEmployees: undefined })).size).toBeUndefined()
  })

  it('parses Pega compact datetime for created_at', () => {
    expect(transformCompany(makeRaw()).created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('parses Pega compact datetime for updated_at', () => {
    expect(transformCompany(makeRaw()).updated_at).toBe('2026-01-20T12:00:00.000Z')
  })

  it('passes CompanySchema validation', () => {
    expect(() => CompanySchema.parse(transformCompany(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransformCompany round-trips name', () => {
    const result = untransformCompany({ name: 'New Corp' })
    expect((result as { content: Record<string, unknown> }).content.AccountName).toBe('New Corp')
  })

  it('untransformCompany converts size to string', () => {
    const result = untransformCompany({ name: 'X', size: 50 })
    expect((result as { content: Record<string, unknown> }).content.NumberOfEmployees).toBe('50')
  })
})
