/**
 * Xero's curated read-only scopes were broad, and a real authorize attempt
 * failed on them:
 *
 *   https://login.xero.com/identity/error?errorId=...
 *
 * Xero moved to GRANULAR scopes for every app created on or after 2026-03-02.
 * The broad `accounting.transactions` / `accounting.reports.read` family is not
 * available to such an app at all, so requesting them fails the authorize step
 * before the user ever sees a consent screen. The app this was reproduced
 * against lists the granular set — accounting.invoices, accounting.payments,
 * accounting.banktransactions, accounting.manualjournals and per-report reads —
 * with no broad equivalents. Older apps may still hold broad scopes and Xero
 * permits mixing until 2027-09, which makes granular the only forward-
 * compatible choice rather than merely the newer one.
 *
 * Source: https://developer.xero.com/faq/granular-scopes
 *
 * Two further things this pins, both independent of the granular migration:
 *
 *   - `offline_access` was absent. Without it Xero issues no refresh token, so
 *     a read-only Connect Link produced a connection that stopped working when
 *     its access token expired — an hour later, with nothing to explain it. It
 *     grants no additional data access.
 *   - The set asked for attachments, assets, projects, files and reports. The
 *     adapter calls exactly four endpoints — Organisation, Invoices, Contacts,
 *     Accounts — so those scopes asked a customer to grant access the
 *     integration never uses, which is the opposite of a read-only link's
 *     purpose.
 */
import { describe, it, expect } from 'vitest'
import { READ_SCOPES } from '../../../../../../src/verticals/accounting/platforms/read-scopes.generated'

const xero = READ_SCOPES['xero'] ?? []

/** Broad scopes unavailable to any app created on or after 2026-03-02. */
const BROAD = ['accounting.transactions', 'accounting.transactions.read', 'accounting.reports.read']

describe('Xero read-only scopes', () => {
  it('requests no broad scope a post-March-2026 app cannot hold', () => {
    for (const s of BROAD) expect(xero).not.toContain(s)
  })

  it('reads invoices through the granular scope', () => {
    // Also the scope that reaches bills (ACCPAY invoices), CreditNotes,
    // PurchaseOrders and Quotes.
    expect(xero).toContain('accounting.invoices.read')
  })

  it('reaches bank transactions and manual journals', () => {
    // Verified live: a grant without these 401s on both endpoints.
    expect(xero).toContain('accounting.banktransactions.read')
    expect(xero).toContain('accounting.manualjournals.read')
  })

  it('keeps contacts and settings, which cover Contacts, Accounts and Organisation', () => {
    expect(xero).toContain('accounting.contacts.read')
    expect(xero).toContain('accounting.settings.read')
  })

  it('requests offline_access, or the connection cannot refresh', () => {
    expect(xero).toContain('offline_access')
  })

  it('asks for nothing the adapter never calls', () => {
    // The adapter's entire surface is Organisation, Invoices, Contacts,
    // Accounts. Anything beyond that is access a customer grants for nothing.
    for (const s of ['accounting.attachments.read', 'assets.read', 'projects.read', 'files.read']) {
      expect(xero).not.toContain(s)
    }
  })

  it('is read-only — no scope grants writes', () => {
    const writeish = xero.filter(
      (s) => !s.endsWith('.read') && !['openid', 'profile', 'email', 'offline_access'].includes(s),
    )
    expect(writeish).toEqual([])
  })
})
