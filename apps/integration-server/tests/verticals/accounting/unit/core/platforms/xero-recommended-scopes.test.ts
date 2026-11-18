/**
 * What a Xero app can actually be asked for.
 *
 * Xero moved to granular scopes for every app created on or after 2026-03-02.
 * The broad scopes do not merely grant more than a read-only link should — a
 * current app cannot request them at all: Xero answers the authorize request
 * with /identity/error before any login prompt, so a connection cannot be made.
 *
 * That makes this the opposite of a width trade-off. Probed live against a
 * current app, one scope at a time:
 *
 *   accepted   accounting.payments.read, accounting.attachments.read,
 *              accounting.budgets.read, files.read, assets.read, projects.read
 *   REJECTED   accounting.transactions, accounting.transactions.read,
 *              accounting.reports.read, accounting.expenseclaims.read,
 *              accounting.receipts.read, bankfeeds
 *
 * `recommendedScopes` is what an operator is shown and copies into their
 * platform config, and it recommended two of the rejected six — so following
 * the recommendation produced a Xero integration that could not connect.
 */
import { describe, it, expect } from 'vitest'
import { PLATFORMS } from '../../../../../../src/verticals/accounting/platforms/metadata'
import {
  READ_SCOPES,
  RECOMMENDED_SCOPES_EXTRA,
} from '../../../../../../src/verticals/accounting/platforms/read-scopes.generated'

/** Rejected outright by a Xero app created on or after 2026-03-02. */
const UNREQUESTABLE = [
  'accounting.transactions',
  'accounting.transactions.read',
  'accounting.reports.read',
  'accounting.expenseclaims.read',
  'accounting.receipts.read',
  'bankfeeds',
]

const xero = PLATFORMS.find((p) => p.slug === 'xero')!

describe('Xero scopes a current app cannot request', () => {
  /**
   * `RECOMMENDED_SCOPES_EXTRA` first, because it is the list that wins:
   * `tagAndMerge` in server.ts overrides metadata's `recommendedScopes` with
   * it whenever an entry exists, so it — not metadata — is what
   * `GET /admin/platforms/:vertical/:slug/config` serves and what the admin
   * scope picker offers. Asserting only on metadata passed while the served
   * recommendation still carried every rejected scope.
   */
  it('offers none of them in the catalogue the admin picker actually serves', () => {
    const offending = RECOMMENDED_SCOPES_EXTRA.xero.filter((s) => UNREQUESTABLE.includes(s))
    expect(offending).toEqual([])
  })

  it('recommends none of them in metadata either, so the two cannot drift apart', () => {
    const offending = (xero.recommendedScopes ?? []).filter((s) => UNREQUESTABLE.includes(s))
    expect(offending).toEqual([])
  })

  it('requests none of them on a read-only link', () => {
    const offending = READ_SCOPES.xero.filter((s) => UNREQUESTABLE.includes(s))
    expect(offending).toEqual([])
  })

  it('keeps offline_access, without which a connection dies at first refresh', () => {
    expect(xero.recommendedScopes).toContain('offline_access')
    expect(RECOMMENDED_SCOPES_EXTRA.xero).toContain('offline_access')
  })

  it('still recommends enough to read what the adapter actually calls', () => {
    // Invoices/bills/creditnotes/orders, contacts, accounts+org+taxrates,
    // banktransactions, manualjournals — the eleven resources that do sync.
    for (const scope of [
      'accounting.invoices.read',
      'accounting.contacts.read',
      'accounting.settings.read',
      'accounting.banktransactions.read',
      'accounting.manualjournals.read',
    ]) {
      expect(xero.recommendedScopes).toContain(scope)
    }
  })
})

describe('Expenses reach a scope the app can actually request', () => {
  it('is served by banktransactions.read, not by the rejected transactions scope', async () => {
    const { XeroAdapter } = await import(
      '../../../../../../src/verticals/accounting/adapters/xero/index.js'
    )
    // The resource is wired, and the scope that reaches it is one a current app
    // can be granted. ExpenseClaims/Receipts would have needed
    // accounting.transactions — in the REJECTED list above — so the endpoint
    // choice is what makes this resource possible at all.
    expect(
      (XeroAdapter.prototype as unknown as Record<string, unknown>)['listExpenses'],
    ).toBeTypeOf('function')
    expect(READ_SCOPES.xero).toContain('accounting.banktransactions.read')
  })
})
