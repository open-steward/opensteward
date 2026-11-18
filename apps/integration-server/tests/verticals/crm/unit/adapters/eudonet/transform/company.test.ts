import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/eudonet/transform/company'
import type { EudonetRow } from '../../../../../../../src/verticals/crm/adapters/eudonet/client'
import {
  FIELD_COMPANY_NAME,
  FIELD_COMPANY_DOMAIN,
  FIELD_COMPANY_PHONE,
  FIELD_COMPANY_INDUSTRY,
  FIELD_COMPANY_SIZE,
  FIELD_COMPANY_CREATED_AT,
  FIELD_COMPANY_UPDATED_AT,
} from '../../../../../../../src/verticals/crm/adapters/eudonet/constants'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRow(fields: Record<number, unknown> = {}, fileId = 42): EudonetRow {
  return {
    FileId: fileId,
    Fields: Object.entries(fields).map(([k, v]) => ({ DescId: Number(k), Value: v })),
  }
}

describe('eudonet transformCompany', () => {
  it('maps FileId to string id', () => {
    expect(transformCompany(makeRow({}, 99)).id).toBe('99')
  })

  it('extracts name from field 101', () => {
    const row = makeRow({ [FIELD_COMPANY_NAME]: 'Acme Corp' })
    expect(transformCompany(row).name).toBe('Acme Corp')
  })

  it('falls back to empty string when name field absent', () => {
    expect(transformCompany(makeRow()).name).toBe('')
  })

  it('extracts domain from field 102', () => {
    const row = makeRow({ [FIELD_COMPANY_DOMAIN]: 'acme.example' })
    expect(transformCompany(row).domain).toBe('acme.example')
  })

  it('extracts phone from field 103', () => {
    const row = makeRow({ [FIELD_COMPANY_PHONE]: '+14155550100' })
    expect(transformCompany(row).phone).toBe('+14155550100')
  })

  it('extracts industry from field 104', () => {
    const row = makeRow({ [FIELD_COMPANY_INDUSTRY]: 'Manufacturing' })
    expect(transformCompany(row).industry).toBe('Manufacturing')
  })

  it('extracts size as number from field 105', () => {
    const row = makeRow({ [FIELD_COMPANY_SIZE]: '350' })
    expect(transformCompany(row).size).toBe(350)
  })

  it('converts ISO timestamp from field 190 to created_at', () => {
    const row = makeRow({ [FIELD_COMPANY_CREATED_AT]: '2023-11-01T10:00:00Z' })
    expect(transformCompany(row).created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('converts ISO timestamp from field 191 to updated_at', () => {
    const row = makeRow({ [FIELD_COMPANY_UPDATED_AT]: '2023-11-14T22:00:00Z' })
    expect(transformCompany(row).updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRow())).not.toThrow()
  })

  it('preserves raw row as metadata by reference', () => {
    const row = makeRow()
    expect(transformCompany(row).metadata).toBe(row)
  })

  it('passes CompanySchema validation with full input', () => {
    const row = makeRow({
      [FIELD_COMPANY_NAME]: 'Acme Corp',
      [FIELD_COMPANY_DOMAIN]: 'acme.example',
      [FIELD_COMPANY_PHONE]: '+14155550100',
      [FIELD_COMPANY_INDUSTRY]: 'Manufacturing',
      [FIELD_COMPANY_SIZE]: '350',
      [FIELD_COMPANY_CREATED_AT]: '2023-11-01T10:00:00Z',
      [FIELD_COMPANY_UPDATED_AT]: '2023-11-14T22:00:00Z',
    })
    const result = transformCompany(row)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

describe('eudonet untransformCompany', () => {
  it('emits name field with correct DescId', () => {
    const fields = untransformCompany({ name: 'Acme Corp' })
    const f = fields.find((x) => x.DescId === FIELD_COMPANY_NAME)
    expect(f?.Value).toBe('Acme Corp')
  })

  it('emits domain field with correct DescId', () => {
    const fields = untransformCompany({ domain: 'acme.example' })
    const f = fields.find((x) => x.DescId === FIELD_COMPANY_DOMAIN)
    expect(f?.Value).toBe('acme.example')
  })

  it('emits size field when provided', () => {
    const fields = untransformCompany({ size: 350 })
    const f = fields.find((x) => x.DescId === FIELD_COMPANY_SIZE)
    expect(f?.Value).toBe(350)
  })

  it('omits fields not provided', () => {
    const fields = untransformCompany({ name: 'Acme' })
    expect(fields.find((x) => x.DescId === FIELD_COMPANY_DOMAIN)).toBeUndefined()
  })

  it('returns empty array when no data provided', () => {
    expect(untransformCompany({})).toEqual([])
  })
})
