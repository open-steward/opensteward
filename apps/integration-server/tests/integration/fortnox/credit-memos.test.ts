/**
 * Live check of the one reading the unit tests cannot prove: that Fortnox
 * answers GET /3/invoices?credit=true with credit invoices only.
 *
 * The `credit` query parameter is documented ("Credit of invoices to list",
 * https://apps.fortnox.se/apidocs), but its VALUE is not; `true` is the reading
 * of a boolean field. The unit tests' fake upstream encodes that same reading,
 * so only a live company can settle it. Each returned credit memo is re-read
 * through GET /3/invoices/{n}, whose `Credit` flag the docs describe as "If the
 * invoice is a credit invoice."
 *
 * Vacuous unless the sandbox company holds at least one credit invoice and one
 * debit invoice.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { hasFortnoxTokens, getCredentials, getAdapter } from './setup'
import { FortnoxClient } from '../../../src/verticals/accounting/adapters/fortnox/client'
import type { FortnoxAdapter } from '../../../src/verticals/accounting/adapters/fortnox'
import type { Credentials } from '../../../src/verticals/accounting/adapter/interface'

describe.skipIf(!hasFortnoxTokens)('Fortnox Integration: Credit memos', () => {
  let adapter: FortnoxAdapter
  let creds: Credentials

  beforeAll(async () => {
    adapter = getAdapter()
    creds = await getCredentials()
  })

  it('returns credit invoices only', async () => {
    const memos = await adapter.listCreditMemos(creds, { limit: 20 })
    const client = new FortnoxClient(creds)
    for (const memo of memos) {
      const res = await client.get<{ Invoice: { Credit?: unknown } }>(`invoices/${memo.id}`)
      expect(String(res.Invoice.Credit), `invoice ${memo.id}`).toBe('true')
    }
  })

  it('counts fewer credit invoices than invoices when a debit invoice exists', async () => {
    const all = withPageSink({ limit: 1 })
    await adapter.listInvoices(creds, all)
    const credit = withPageSink({ limit: 1 })
    await adapter.listCreditMemos(creds, credit)

    const invoiceTotal = readUpstreamPage(all)?.totalCount ?? 0
    const creditTotal = readUpstreamPage(credit)?.totalCount ?? 0
    if (invoiceTotal === 0) return // an empty company proves nothing

    // Equal totals would mean Fortnox ignored `credit=true` (or holds only
    // credit invoices, which a sandbox used for this check should not).
    expect(creditTotal).toBeLessThan(invoiceTotal)
  })
})
