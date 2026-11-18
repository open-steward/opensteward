import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/eudonet/transform/contact'
import type { EudonetRow } from '../../../../../../../src/verticals/crm/adapters/eudonet/client'
import {
  FIELD_CONTACT_LASTNAME,
  FIELD_CONTACT_FIRSTNAME,
  FIELD_CONTACT_EMAIL,
  FIELD_CONTACT_PHONE,
  FIELD_CONTACT_MOBILE,
  FIELD_CONTACT_TITLE,
  FIELD_CONTACT_COMPANY_ID,
  FIELD_CONTACT_CREATED_AT,
  FIELD_CONTACT_UPDATED_AT,
} from '../../../../../../../src/verticals/crm/adapters/eudonet/constants'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRow(fields: Record<number, unknown> = {}, fileId = 42): EudonetRow {
  return {
    FileId: fileId,
    Fields: Object.entries(fields).map(([k, v]) => ({ DescId: Number(k), Value: v })),
  }
}

describe('eudonet transformContact', () => {
  it('maps FileId to string id', () => {
    expect(transformContact(makeRow({}, 77)).id).toBe('77')
  })

  it('extracts last_name from field 201', () => {
    const row = makeRow({ [FIELD_CONTACT_LASTNAME]: 'Doe' })
    expect(transformContact(row).last_name).toBe('Doe')
  })

  it('extracts first_name from field 202', () => {
    const row = makeRow({ [FIELD_CONTACT_FIRSTNAME]: 'Jane' })
    expect(transformContact(row).first_name).toBe('Jane')
  })

  it('joins first and last name into name', () => {
    const row = makeRow({
      [FIELD_CONTACT_FIRSTNAME]: 'Jane',
      [FIELD_CONTACT_LASTNAME]: 'Doe',
    })
    expect(transformContact(row).name).toBe('Jane Doe')
  })

  it('extracts email from field 203', () => {
    const row = makeRow({ [FIELD_CONTACT_EMAIL]: 'jane@example.com' })
    expect(transformContact(row).email).toBe('jane@example.com')
  })

  it('extracts phone from field 204', () => {
    const row = makeRow({ [FIELD_CONTACT_PHONE]: '+14155550123' })
    expect(transformContact(row).phone).toBe('+14155550123')
  })

  it('extracts mobile from field 205', () => {
    const row = makeRow({ [FIELD_CONTACT_MOBILE]: '+14155550456' })
    expect(transformContact(row).mobile).toBe('+14155550456')
  })

  it('extracts title from field 206', () => {
    const row = makeRow({ [FIELD_CONTACT_TITLE]: 'VP Sales' })
    expect(transformContact(row).title).toBe('VP Sales')
  })

  it('extracts company_id from field 207', () => {
    const row = makeRow({ [FIELD_CONTACT_COMPANY_ID]: '100' })
    expect(transformContact(row).company_id).toBe('100')
  })

  it('converts ISO timestamps to created_at/updated_at', () => {
    const row = makeRow({
      [FIELD_CONTACT_CREATED_AT]: '2023-11-01T10:00:00Z',
      [FIELD_CONTACT_UPDATED_AT]: '2023-11-14T22:00:00Z',
    })
    const result = transformContact(row)
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRow())).not.toThrow()
  })

  it('preserves raw row as metadata by reference', () => {
    const row = makeRow()
    expect(transformContact(row).metadata).toBe(row)
  })

  it('passes ContactSchema validation with full input', () => {
    const row = makeRow({
      [FIELD_CONTACT_FIRSTNAME]: 'Jane',
      [FIELD_CONTACT_LASTNAME]: 'Doe',
      [FIELD_CONTACT_EMAIL]: 'jane@example.com',
      [FIELD_CONTACT_PHONE]: '+14155550123',
      [FIELD_CONTACT_MOBILE]: '+14155550456',
      [FIELD_CONTACT_TITLE]: 'VP Sales',
      [FIELD_CONTACT_COMPANY_ID]: '100',
      [FIELD_CONTACT_CREATED_AT]: '2023-11-01T10:00:00Z',
      [FIELD_CONTACT_UPDATED_AT]: '2023-11-14T22:00:00Z',
    })
    const result = transformContact(row)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('eudonet untransformContact', () => {
  it('emits last_name field with correct DescId', () => {
    const fields = untransformContact({ last_name: 'Doe' })
    const f = fields.find((x) => x.DescId === FIELD_CONTACT_LASTNAME)
    expect(f?.Value).toBe('Doe')
  })

  it('emits email field with correct DescId', () => {
    const fields = untransformContact({ email: 'jane@example.com' })
    const f = fields.find((x) => x.DescId === FIELD_CONTACT_EMAIL)
    expect(f?.Value).toBe('jane@example.com')
  })

  it('emits company_id field with correct DescId', () => {
    const fields = untransformContact({ company_id: '100' })
    const f = fields.find((x) => x.DescId === FIELD_CONTACT_COMPANY_ID)
    expect(f?.Value).toBe('100')
  })

  it('omits fields not provided', () => {
    const fields = untransformContact({ first_name: 'Jane' })
    expect(fields.find((x) => x.DescId === FIELD_CONTACT_EMAIL)).toBeUndefined()
  })

  it('returns empty array when no data provided', () => {
    expect(untransformContact({})).toEqual([])
  })
})
