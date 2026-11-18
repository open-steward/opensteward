import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/orocrm/transform/contact'
import type { JsonApiRecord } from '../../../../../../../src/verticals/crm/adapters/orocrm/client'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function makeRecord(
  attrs: Record<string, unknown> = {},
  rels: JsonApiRecord['relationships'] = {},
): JsonApiRecord {
  return {
    type: 'contacts',
    id: 'cont_1',
    attributes: {
      firstName: 'Jane',
      lastName: 'Doe',
      primaryEmail: { value: 'jane.doe@acme.example' },
      primaryPhone: { value: '+14155550123' },
      jobTitle: 'Head of Finance',
      createdAt: '2026-01-15T09:30:00.000Z',
      updatedAt: '2026-02-01T14:20:00.000Z',
      ...attrs,
    },
    relationships: {
      owner: { data: { type: 'users', id: 'usr_5' } },
      account: { data: { type: 'accounts', id: 'acc_1' } },
      ...rels,
    },
  }
}

describe('orocrm transformContact', () => {
  it('maps record.id to string id', () => {
    expect(transformContact(makeRecord()).id).toBe('cont_1')
  })

  it('maps firstName and lastName attributes', () => {
    const result = transformContact(makeRecord())
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
  })

  it('builds name from first + last', () => {
    expect(transformContact(makeRecord()).name).toBe('Jane Doe')
  })

  it('extracts email from primaryEmail object', () => {
    expect(transformContact(makeRecord()).email).toBe('jane.doe@acme.example')
  })

  it('extracts phone from primaryPhone object', () => {
    expect(transformContact(makeRecord()).phone).toBe('+14155550123')
  })

  it('maps jobTitle to title', () => {
    expect(transformContact(makeRecord()).title).toBe('Head of Finance')
  })

  it('maps account relationship to company_id', () => {
    expect(transformContact(makeRecord()).company_id).toBe('acc_1')
  })

  it('overrides company_id with explicit accountId argument', () => {
    expect(transformContact(makeRecord(), 'override_acc').company_id).toBe('override_acc')
  })

  it('maps owner relationship to owner_id', () => {
    expect(transformContact(makeRecord()).owner_id).toBe('usr_5')
  })

  it('maps createdAt / updatedAt', () => {
    const result = transformContact(makeRecord())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('handles email as plain string attribute', () => {
    const result = transformContact(makeRecord({ primaryEmail: 'plain@example.com' }))
    expect(result.email).toBe('plain@example.com')
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeRecord()))).not.toThrow()
  })

  it('untransformContact wraps in JSON:API envelope with type "contacts"', () => {
    const out = untransformContact({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '+1111',
      title: 'CEO',
    })
    expect((out['data'] as Record<string, unknown>)['type']).toBe('contacts')
    const attrs = (out['data'] as Record<string, Record<string, unknown>>)['attributes']
    expect(attrs['firstName']).toBe('Jane')
    expect(attrs['lastName']).toBe('Doe')
    expect((attrs['primaryEmail'] as Record<string, unknown>)['value']).toBe('jane@example.com')
  })
})
