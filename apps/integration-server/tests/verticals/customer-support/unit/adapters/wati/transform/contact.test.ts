import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawWatiContact,
} from '../../../../../../../src/verticals/customer-support/adapters/wati/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('transformContact', () => {
  it('maps a full WATI contact to a Contact with platform=wati', () => {
    const raw: RawWatiContact = {
      id: 'cnt-1',
      wa_id: '14155550100',
      name: 'Alice Liddell',
      phone: '+14155550100',
      contact_status: 'active',
      source: 'import',
      channel_id: 'ch-99',
      opted_in: true,
      allow_broadcast: false,
      created: '2026-01-15T09:00:00Z',
      last_updated: '2026-02-01T12:00:00Z',
    }
    const contact = transformContact(raw)

    expect(contact.id).toBe('cnt-1')
    expect(contact.externalId).toBe('cnt-1')
    expect(contact.platform).toBe('wati')
    expect(contact.name).toBe('Alice Liddell')
    expect(contact.phone).toBe('+14155550100')
    // WATI contacts have no email (WhatsApp-only)
    expect(contact.email).toBeUndefined()
    expect(contact.metadata['contactStatus']).toBe('active')
    expect(contact.metadata['source']).toBe('import')
    expect(contact.metadata['channelId']).toBe('ch-99')
    expect(contact.metadata['optedIn']).toBe('true')
    expect(contact.metadata['allowBroadcast']).toBe('false')
    expect(contact.metadata['created']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(contact.metadata['lastUpdated']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('falls back to wa_id when id is absent', () => {
    const raw: RawWatiContact = { wa_id: '447700900123', name: 'Bob' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('447700900123')
    expect(contact.phone).toBe('447700900123')
  })

  it('handles missing optional fields without throwing', () => {
    const raw: RawWatiContact = {}
    const contact = transformContact(raw)
    expect(contact.id).toBe('')
    expect(contact.name).toBe('')
    expect(contact.email).toBeUndefined()
    expect(contact.phone).toBeUndefined()
  })

  it('passes ContactSchema.parse without throwing', () => {
    const raw: RawWatiContact = {
      id: 'cnt-2',
      wa_id: '14155550200',
      name: 'Carol',
      phone: '+14155550200',
      contact_status: 'active',
      created: '2026-01-15T09:00:00Z',
      last_updated: '2026-02-01T12:00:00Z',
    }
    const contact = transformContact(raw)
    expect(() => ContactSchema.parse(contact)).not.toThrow()
  })
})
