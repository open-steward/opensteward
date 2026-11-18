import { describe, it, expect, beforeAll } from 'vitest'
import { hasFortnoxTokens, getCredentials, getAdapter } from './setup'
import type { FortnoxAdapter } from '../../../src/verticals/accounting/adapters/fortnox'
import type { Credentials } from '../../../src/verticals/accounting/adapter/interface'

describe.skipIf(!hasFortnoxTokens)('Fortnox Integration: Invoices', () => {
  let adapter: FortnoxAdapter
  let creds: Credentials

  beforeAll(async () => {
        adapter = getAdapter()
    creds = await getCredentials()
  })

  it('lists invoices', async () => {
    const invoices = await adapter.listInvoices(creds, { limit: 5 })
    expect(Array.isArray(invoices)).toBe(true)
    for (const inv of invoices) {
      expect(inv.id).toBeTruthy()
      expect(inv.metadata).toBeDefined()
    }
  })

  it('fetches a single invoice by id', async () => {
    const invoices = await adapter.listInvoices(creds, { limit: 1 })
    if (invoices.length === 0) return // no data in test company

    const targetId = invoices[0]?.id

    if (!targetId) throw new Error('expected at least one invoices entry to carry an id')

    const invoice = await adapter.getInvoice(creds, targetId)
    expect(invoice.id).toBe(targetId)
    expect(invoice.metadata).toBeDefined()
  })
})
