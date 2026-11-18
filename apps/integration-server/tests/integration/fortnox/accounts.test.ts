import { describe, it, expect, beforeAll } from 'vitest'
import { hasFortnoxTokens, getCredentials, getAdapter } from './setup'
import type { FortnoxAdapter } from '../../../src/verticals/accounting/adapters/fortnox'
import type { Credentials } from '../../../src/verticals/accounting/adapter/interface'

describe.skipIf(!hasFortnoxTokens)('Fortnox Integration: Accounts', () => {
  let adapter: FortnoxAdapter
  let creds: Credentials

  beforeAll(async () => {
        adapter = getAdapter()
    creds = await getCredentials()
  })

  it('lists accounts', async () => {
    const accounts = await adapter.listAccounts(creds, { limit: 5 })
    expect(Array.isArray(accounts)).toBe(true)
    expect(accounts.length).toBeGreaterThan(0) // every company has a chart of accounts
    for (const account of accounts) {
      expect(account.id).toBeTruthy()
      expect(account.metadata).toBeDefined()
    }
  })

  it('fetches a single account by id', async () => {
    const accounts = await adapter.listAccounts(creds, { limit: 1 })
    const targetId = accounts[0]?.id
    if (!targetId) throw new Error('expected at least one accounts entry to carry an id')
    const account = await adapter.getAccount(creds, targetId)
    expect(account.id).toBe(targetId)
    expect(account.metadata).toBeDefined()
  })
})
