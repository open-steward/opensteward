import { describe, it, expect, beforeAll } from 'vitest'
import { hasFortnoxTokens, getCredentials, getAdapter } from './setup'
import type { FortnoxAdapter } from '../../../src/verticals/accounting/adapters/fortnox'
import type { Credentials } from '../../../src/verticals/accounting/adapter/interface'

describe.skipIf(!hasFortnoxTokens)('Fortnox Integration: Contacts', () => {
  let adapter: FortnoxAdapter
  let creds: Credentials

  beforeAll(async () => {
        adapter = getAdapter()
    creds = await getCredentials()
  })

  it('lists contacts (customers + suppliers)', async () => {
    const contacts = await adapter.listContacts(creds, { limit: 5 })
    expect(Array.isArray(contacts)).toBe(true)
    for (const contact of contacts) {
      expect(contact.id).toBeTruthy()
      expect(contact.metadata).toBeDefined()
    }
  })

  it('fetches a single contact by id', async () => {
    const contacts = await adapter.listContacts(creds, { limit: 1 })
    if (contacts.length === 0) return

    const targetId = contacts[0]?.id

    if (!targetId) throw new Error('expected at least one contacts entry to carry an id')

    const contact = await adapter.getContact(creds, targetId)
    expect(contact.id).toBe(targetId)
    expect(contact.metadata).toBeDefined()
  })
})
