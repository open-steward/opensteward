import { describe, it, expect, beforeAll } from 'vitest'
import { hasFortnoxTokens, getCredentials, getAdapter } from './setup'
import type { FortnoxAdapter } from '../../../src/verticals/accounting/adapters/fortnox'
import type { Credentials } from '../../../src/verticals/accounting/adapter/interface'

describe.skipIf(!hasFortnoxTokens)('Fortnox Integration: Bills', () => {
  let adapter: FortnoxAdapter
  let creds: Credentials

  beforeAll(async () => {
        adapter = getAdapter()
    creds = await getCredentials()
  })

  it('lists bills', async () => {
    const bills = await adapter.listBills(creds, { limit: 5 })
    expect(Array.isArray(bills)).toBe(true)
    for (const bill of bills) {
      expect(bill.id).toBeTruthy()
      expect(bill.metadata).toBeDefined()
    }
  })

  it('fetches a single bill by id', async () => {
    const bills = await adapter.listBills(creds, { limit: 1 })
    if (bills.length === 0) return

    const targetId = bills[0]?.id

    if (!targetId) throw new Error('expected at least one bills entry to carry an id')

    const bill = await adapter.getBill(creds, targetId)
    expect(bill.id).toBe(targetId)
    expect(bill.metadata).toBeDefined()
  })
})
