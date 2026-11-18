import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/nethunt-crm/transform/company'
import { documentedRecord } from '../fixtures'

describe('nethunt-crm transformCompany (v2 Record)', () => {
  it('maps the documented example record and parses as a Company', () => {
    const raw = documentedRecord()
    const out = CompanySchema.parse(transformCompany(raw))
    expect(out).toEqual({
      id: '5f8a2b1c3d4e5f6a7b8c9d0e',
      name: 'Acme Corp',
      created_at: '2025-03-18T10:00:00.000Z',
      updated_at: '2025-03-19T14:23:11.000Z',
      metadata: raw,
    })
  })

  it('refuses a record with no name rather than inventing one', () => {
    expect(() => transformCompany(documentedRecord({ fields: { '2': 'Active' } }))).toThrow(
      /has no name/,
    )
  })
})

describe('nethunt-crm untransformCompany', () => {
  it('copies only the provided fields', () => {
    expect(untransformCompany({ name: 'Acme' })).toEqual({ name: 'Acme' })
  })
})
