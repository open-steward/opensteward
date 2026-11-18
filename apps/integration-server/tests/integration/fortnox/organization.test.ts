import { describe, it, expect, beforeAll } from 'vitest'
import { hasFortnoxTokens, getCredentials, getAdapter } from './setup'
import type { FortnoxAdapter } from '../../../src/verticals/accounting/adapters/fortnox'
import type { Credentials } from '../../../src/verticals/accounting/adapter/interface'

describe.skipIf(!hasFortnoxTokens)('Fortnox Integration: Organization', () => {
  let adapter: FortnoxAdapter
  let creds: Credentials

  beforeAll(async () => {
        adapter = getAdapter()
    creds = await getCredentials()
  })

  it('fetches company information', async () => {
    const org = await adapter.getOrganization(creds)
    expect(org).toBeDefined()
    expect(org.name).toBeTruthy()
    expect(org.metadata).toBeDefined()
  })
})
