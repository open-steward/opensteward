import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { XeroClient } from '../../../../../../src/verticals/accounting/adapters/xero/client'
import { XeroAdapter } from '../../../../../../src/verticals/accounting/adapters/xero'
import type { Credentials, QueryParams } from '../../../../../../src/verticals/accounting/adapter/interface'

/**
 * Finding 16 — `list_accounts(limit=2)` returned ~60 records.
 *
 * Xero's /Accounts endpoint accepts no paging parameters; it returns the whole
 * chart of accounts in one response. The adapter took that as licence to
 * ignore the caller's `page`/`limit` entirely (the signature was literally
 * `_params`). "The platform does not paginate" is a reason to paginate in the
 * adapter, not a reason to drop the request — `list_invoices` on the same
 * adapter honoured `limit` correctly, so a client had no way to know which
 * endpoints meant it.
 */

const CREDS = { accessToken: 'tok', tenantId: 'ten' } as Credentials

function accounts(n: number) {
  return {
    Accounts: Array.from({ length: n }, (_, i) => ({
      AccountID: `acc-${i}`,
      Code: String(200 + i),
      Name: `Account ${i}`,
      Type: 'REVENUE',
      Class: 'REVENUE',
      Status: 'ACTIVE',
      Description: '',
      CurrencyCode: 'GBP',
    })),
  }
}

function mockGet(n: number) {
  return vi.spyOn(XeroClient.prototype, 'get').mockResolvedValue(accounts(n) as never)
}

afterEach(() => vi.restoreAllMocks())

const adapter = new XeroAdapter({
  clientId: 'cid',
  clientSecret: 'secret',
  redirectUri: 'https://example.test/callback',
  scopes: ['accounting.settings.read'],
})

describe('XeroAdapter.listAccounts honours the requested page', () => {
  it('returns at most `limit` records', async () => {
    mockGet(60)
    const rows = await adapter.listAccounts!(CREDS, withPageSink({ limit: 2 }))
    expect(rows).toHaveLength(2)
  })

  it('returns the first page by default', async () => {
    mockGet(60)
    const rows = await adapter.listAccounts!(CREDS, withPageSink({ limit: 2 }))
    expect(rows.map((r) => r.id)).toEqual(['acc-0', 'acc-1'])
  })

  it('advances with `page` instead of repeating page 1', async () => {
    mockGet(60)
    const rows = await adapter.listAccounts!(CREDS, withPageSink({ limit: 2, page: 2 }))
    expect(rows.map((r) => r.id)).toEqual(['acc-2', 'acc-3'])
  })

  it('reports the upstream total so hasMore is derivable rather than guessed', async () => {
    mockGet(60)
    const params: QueryParams = withPageSink({ limit: 2 })
    await adapter.listAccounts!(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(60)
  })

  it('returns a short final page rather than padding or wrapping', async () => {
    mockGet(5)
    const rows = await adapter.listAccounts!(CREDS, withPageSink({ limit: 2, page: 3 }))
    expect(rows.map((r) => r.id)).toEqual(['acc-4'])
  })

  it('returns empty past the end', async () => {
    mockGet(5)
    const rows = await adapter.listAccounts!(CREDS, withPageSink({ limit: 2, page: 9 }))
    expect(rows).toEqual([])
  })

  it('serves every row when the caller names no limit, and says that is the end', async () => {
    mockGet(250)
    const params: QueryParams = withPageSink({})
    const rows = await adapter.listAccounts!(CREDS, params)
    // The shared pageLocally contract: every row is already in hand, so a
    // caller that asked for no page size gets them all. The router and the
    // sync worker always send a limit, so neither path reaches this. The old
    // fallback to a 100-row page reported no hasMore, so a direct caller had
    // to do the arithmetic against the total to learn a page 2 existed.
    expect(rows).toHaveLength(250)
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 250, hasMore: false })
  })
})
