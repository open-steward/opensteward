import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import { XeroClient } from '../../../../../../src/verticals/accounting/adapters/xero/client'
import { XeroAdapter } from '../../../../../../src/verticals/accounting/adapters/xero'
import type { Credentials } from '../../../../../../src/verticals/accounting/adapter/interface'

/**
 * Finding 22 — `updated_after` reached Xero as a query parameter it ignores.
 *
 * The adapter sent `{ IFModifiedSince: <iso> }` inside the axios `params`
 * object, which lands on the query string. Xero filters on the
 * `If-Modified-Since` REQUEST HEADER; an unrecognised query parameter is
 * discarded without comment. So the filter was accepted by us, transmitted,
 * and dropped by them — a future timestamp returned every record, verified
 * live:
 *
 *     updated_after=2099-01-01  ->  32 records
 *     updated_after=2000-01-01  ->  32 records
 *
 * `XeroClient.get(path, params)` had no way to send a header at all, which is
 * the underlying reason the value went where it did.
 */

const CREDS = { accessToken: 'tok', tenantId: 'ten' } as Credentials
const SINCE = new Date('2026-01-01T00:00:00.000Z')

const adapter = new XeroAdapter({
  clientId: 'cid',
  clientSecret: 'secret',
  redirectUri: 'https://example.test/cb',
  scopes: ['accounting.transactions.read'],
})

function spyGet(payload: unknown) {
  return vi.spyOn(XeroClient.prototype, 'get').mockResolvedValue(payload as never)
}

afterEach(() => vi.restoreAllMocks())

describe('Xero sends updated_after as the If-Modified-Since header', () => {
  it('does not put IFModifiedSince on the query string', async () => {
    const get = spyGet({ Invoices: [] })
    await adapter.listInvoices!(CREDS, withPageSink({ updatedAfter: SINCE }))

    const [, params] = get.mock.calls[0]!
    expect(params).not.toHaveProperty('IFModifiedSince')
    expect(params).not.toHaveProperty('If-Modified-Since')
  })

  it('sends the header Xero actually filters on', async () => {
    const get = spyGet({ Invoices: [] })
    await adapter.listInvoices!(CREDS, withPageSink({ updatedAfter: SINCE }))

    const headers = get.mock.calls[0]![2] as Record<string, string> | undefined
    expect(headers?.['If-Modified-Since']).toBe(SINCE.toISOString())
  })

  it('sends no such header when the caller named no timestamp', async () => {
    const get = spyGet({ Invoices: [] })
    await adapter.listInvoices!(CREDS, withPageSink({}))

    const headers = get.mock.calls[0]![2] as Record<string, string> | undefined
    expect(headers?.['If-Modified-Since']).toBeUndefined()
  })

  it('keeps the other query params intact alongside the header', async () => {
    // The header must be additive — the `where` filter that separates ACCREC
    // invoices from ACCPAY bills has to survive, or invoices start including
    // payables again.
    const get = spyGet({ Invoices: [] })
    await adapter.listInvoices!(CREDS, withPageSink({ updatedAfter: SINCE, limit: 5 }))

    const params = get.mock.calls[0]![1] as Record<string, unknown>
    expect(params['where']).toBe('Type=="ACCREC"')
    expect(params['pageSize']).toBe(5)
  })

  it.each([
    ['listBills', (p: unknown) => adapter.listBills!(CREDS, p as never), { Invoices: [] }],
    ['listExpenses', (p: unknown) => adapter.listExpenses!(CREDS, p as never), { BankTransactions: [] }],
  ])('%s sends the header too', async (_name, call, payload) => {
    // Every method that accepted updatedAfter had the same defect; fixing only
    // the one that was reported repeats the pattern this project keeps hitting.
    const get = spyGet(payload)
    await call(withPageSink({ updatedAfter: SINCE }))

    const headers = get.mock.calls[0]![2] as Record<string, string> | undefined
    expect(headers?.['If-Modified-Since']).toBe(SINCE.toISOString())
  })
})

describe('XeroClient.get can carry headers at all', () => {
  it('passes headers through to axios', async () => {
    const client = new XeroClient(CREDS)
    const http = (client as unknown as { http: { get: unknown } }).http
    const spy = vi.spyOn(http as { get: (...a: unknown[]) => unknown }, 'get').mockResolvedValue({ data: {} } as never)

    await client.get('Invoices', { pageSize: 1 }, { 'If-Modified-Since': SINCE.toISOString() })

    const [, cfg] = spy.mock.calls[0] as [string, { params?: unknown; headers?: Record<string, string> }]
    expect(cfg.headers?.['If-Modified-Since']).toBe(SINCE.toISOString())
    expect(cfg.params).toEqual({ pageSize: 1 })
  })
})
