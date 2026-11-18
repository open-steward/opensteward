/**
 * Fortnox has no credit-invoice endpoint. Credit invoices are `/invoices` rows
 * whose `Credit` property is set, and that property is searchable: GET
 * /3/invoices takes it as the `credit` query parameter, so Fortnox filters and
 * pages credit invoices itself.
 *
 * The adapter used to filter client-side instead, walking every /invoices page
 * on page 1 and answering later pages with []. A page 1 holding every credit
 * invoice was truncated to the caller's limit by the router, and the filter
 * itself probably kept nothing: the 2022 first-party "List all invoices"
 * example and a recorded 2023 list response carry no `Credit` on their rows,
 * though the current spec's list-item schema declares one. The paging contract
 * itself is pinned in request-shape.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { FortnoxAdapter } from '../../../../../../src/verticals/accounting/adapters/fortnox'
import { FortnoxClient } from '../../../../../../src/verticals/accounting/adapters/fortnox/client'
import { CreditMemoSchema } from '../../../../../../src/verticals/accounting/schema/creditmemo'
import type { Credentials } from '../../../../../../src/verticals/accounting/adapter/interface'

const adapter = new FortnoxAdapter({
  clientId: 'test-id',
  clientSecret: 'test-secret',
  redirectUri: 'http://localhost:3010/auth/accounting/fortnox/callback',
  scopes: ['invoice'],
})

const creds = { accessToken: 'tok' } as Credentials

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    DocumentNumber: '1001',
    CustomerNumber: 'C1',
    CustomerName: 'Acme AB',
    InvoiceDate: '2024-03-01',
    DueDate: '2024-03-31',
    Total: 1250,
    TotalVAT: 312,
    Balance: 0,
    Currency: 'SEK',
    Booked: true,
    Cancelled: false,
    PaidAmount: 1250,
    Credit: 'false',
    InvoiceRows: [],
    ...overrides,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('FortnoxAdapter.listCreditMemos', () => {
  it('asks Fortnox for credit invoices only, rather than filtering them here', async () => {
    const spy = vi
      .spyOn(FortnoxClient.prototype, 'get')
      .mockResolvedValue({ Invoices: [] } as never)
    await adapter.listCreditMemos(creds, { limit: 100 })
    expect(spy).toHaveBeenCalledWith(
      'invoices',
      expect.objectContaining({ credit: 'true', page: 1, limit: 100 }),
    )
  })

  // Recorded list responses have no Credit field on their rows, so a
  // client-side filter on it would keep nothing. Fortnox has already filtered.
  it('keeps every row Fortnox returns, though list rows carry no Credit flag', async () => {
    const { Credit: _omitted, ...summary } = invoice()
    vi.spyOn(FortnoxClient.prototype, 'get').mockResolvedValue({
      Invoices: [
        { ...summary, DocumentNumber: '1002' },
        { ...summary, DocumentNumber: '1005' },
      ],
    } as never)

    const rows = await adapter.listCreditMemos(creds, { limit: 100 })
    expect(rows.map((r) => r.id)).toEqual(['1002', '1005'])
    expect(() => CreditMemoSchema.parse(rows[0])).not.toThrow()
  })

  it('answers a later page from Fortnox instead of returning []', async () => {
    const spy = vi.spyOn(FortnoxClient.prototype, 'get').mockResolvedValue({
      Invoices: [invoice({ DocumentNumber: 'p2-credit', Credit: 'true' })],
    } as never)

    const rows = await adapter.listCreditMemos(creds, { page: 2, limit: 100 })

    expect(spy).toHaveBeenCalledWith('invoices', expect.objectContaining({ page: 2 }))
    expect(rows.map((r) => r.id)).toEqual(['p2-credit'])
  })

  it('makes one request per page', async () => {
    const full = Array.from({ length: 100 }, (_, i) =>
      invoice({ DocumentNumber: `p1-${i}`, Credit: 'true' }),
    )
    const spy = vi
      .spyOn(FortnoxClient.prototype, 'get')
      .mockResolvedValue({ Invoices: full } as never)
    await adapter.listCreditMemos(creds, { limit: 100 })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('returns [] when the wrapper key is absent', async () => {
    vi.spyOn(FortnoxClient.prototype, 'get').mockResolvedValue({} as never)
    await expect(adapter.listCreditMemos(creds, { limit: 100 })).resolves.toEqual([])
  })

  it('propagates an upstream failure rather than reporting "no credit memos"', async () => {
    vi.spyOn(FortnoxClient.prototype, 'get').mockRejectedValue(new Error('Fortnox 500'))
    await expect(adapter.listCreditMemos(creds, { limit: 100 })).rejects.toThrow('Fortnox 500')
  })

  it('is a function the sync worker can reach', () => {
    expect(typeof (adapter as unknown as Record<string, unknown>)['listCreditMemos']).toBe(
      'function',
    )
  })
})
