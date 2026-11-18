import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/nethunt-crm/transform/contact'
import { documentedRecord } from '../fixtures'

describe('nethunt-crm transformContact (v2 Record)', () => {
  it('maps the documented example record and parses as a Contact', () => {
    const raw = documentedRecord()
    const out = ContactSchema.parse(transformContact(raw))
    expect(out.id).toBe('5f8a2b1c3d4e5f6a7b8c9d0e')
    expect(out.name).toBe('Acme Corp')
    expect(out.created_at).toBe('2025-03-18T10:00:00.000Z')
    expect(out.updated_at).toBe('2025-03-19T14:23:11.000Z')
    expect(out.metadata).toEqual(raw)
  })

  it('maps no custom field: ids like "4" are workspace-specific', () => {
    const out = transformContact(documentedRecord())
    expect(out.email).toBeUndefined()
    expect(out.phone).toBeUndefined()
    expect(out.first_name).toBeUndefined()
  })

  it('leaves name unset when the record has none ("Empty and unset fields are omitted")', () => {
    const out = ContactSchema.parse(transformContact(documentedRecord({ fields: { '2': 'x' } })))
    expect(out.name).toBeUndefined()
  })
})

describe('nethunt-crm untransformContact', () => {
  it('copies only the provided fields', () => {
    expect(untransformContact({ first_name: 'Jane' })).toEqual({ first_name: 'Jane' })
  })
})
