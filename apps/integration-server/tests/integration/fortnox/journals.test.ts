import { describe, it, expect, beforeAll } from 'vitest'
import { hasFortnoxTokens, getCredentials, getAdapter } from './setup'
import type { FortnoxAdapter } from '../../../src/verticals/accounting/adapters/fortnox'
import type { Credentials } from '../../../src/verticals/accounting/adapter/interface'

describe.skipIf(!hasFortnoxTokens)('Fortnox Integration: Journals', () => {
  let adapter: FortnoxAdapter
  let creds: Credentials

  beforeAll(async () => {
        adapter = getAdapter()
    creds = await getCredentials()
  })

  it('lists journals', async () => {
    const journals = await adapter.listJournals(creds, { limit: 5 })
    expect(Array.isArray(journals)).toBe(true)
    for (const journal of journals) {
      expect(journal.id).toBeTruthy()
      expect(journal.metadata).toBeDefined()
    }
  })

  it('fetches a single journal by id', async () => {
    const journals = await adapter.listJournals(creds, { limit: 1 })
    if (journals.length === 0) return

    const targetId = journals[0]?.id

    if (!targetId) throw new Error('expected at least one journals entry to carry an id')

    const journal = await adapter.getJournal(creds, targetId)
    expect(journal.id).toBe(targetId)
    expect(journal.metadata).toBeDefined()
  })
})
