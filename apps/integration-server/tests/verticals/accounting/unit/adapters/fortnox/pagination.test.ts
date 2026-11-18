/**
 * Fortnox reports pagination on every list call and the adapter threw it away.
 *
 * Each list method destructures `MetaInformation` — `@TotalResources`,
 * `@CurrentPage`, `@TotalPages` — off the response and returns only the rows.
 * So `list_accounts` with `limit: 100` returned exactly 100 of 1,339 with
 * nothing saying more existed, even though the platform had said so in the very
 * same payload.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { FortnoxAdapter } from '../../../../../../src/verticals/accounting/adapters/fortnox'
import { FortnoxClient } from '../../../../../../src/verticals/accounting/adapters/fortnox/client'
import type { Credentials } from '../../../../../../src/verticals/accounting/adapter/interface'

const adapter = new FortnoxAdapter({
  clientId: 'i',
  clientSecret: 's',
  redirectUri: 'http://localhost:3010/cb',
  scopes: ['invoice'],
})
const creds = { accessToken: 'tok' } as Credentials

afterEach(() => vi.restoreAllMocks())

const META = { '@TotalResources': 1339, '@CurrentPage': 1, '@TotalPages': 14 }

describe('Fortnox reports the pagination it already receives', () => {
  it('reports the real total for accounts — the 1339-vs-100 case', async () => {
    vi.spyOn(FortnoxClient.prototype, 'get').mockResolvedValue({
      Accounts: [{ Number: 1930, Active: true }],
      MetaInformation: META,
    } as never)

    const params = withPageSink({ limit: 100, page: 1 })
    await adapter.listAccounts(creds, params)

    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 1339,
      totalPages: 14,
      currentPage: 1,
    })
  })

  it('reports for invoices too, not just the one resource that prompted this', async () => {
    vi.spyOn(FortnoxClient.prototype, 'get').mockResolvedValue({
      Invoices: [],
      MetaInformation: { '@TotalResources': 7, '@CurrentPage': 1, '@TotalPages': 1 },
    } as never)

    const params = withPageSink({ limit: 100 })
    await adapter.listInvoices(creds, params)

    expect(readUpstreamPage(params)?.totalCount).toBe(7)
  })

  it('reports nothing when the platform omitted MetaInformation', async () => {
    vi.spyOn(FortnoxClient.prototype, 'get').mockResolvedValue({ Invoices: [] } as never)

    const params = withPageSink({ limit: 100 })
    await adapter.listInvoices(creds, params)

    // Absent, not zero. A fabricated total is worse than an unknown one.
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('still works when the caller attached no sink at all', async () => {
    vi.spyOn(FortnoxClient.prototype, 'get').mockResolvedValue({
      Invoices: [],
      MetaInformation: META,
    } as never)
    await expect(adapter.listInvoices(creds, { limit: 10 })).resolves.toEqual([])
  })
})
