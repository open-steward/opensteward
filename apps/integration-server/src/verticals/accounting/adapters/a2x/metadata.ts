/**
 * A2X adapter resource coverage metadata.
 *
 * A2X is a narrow ecommerce-settlement-to-accounting bridge. Its partner REST
 * API (https://my.a2xaccounting.com/api/v1) is gated behind a private
 * integrator programme and is not publicly documented. Based on the API
 * surface confirmed by the existing adapter implementation (settlements →
 * invoices, accounts, organisation) and A2X's product nature as a middleware
 * that posts summaries to Xero / QuickBooks / NetSuite rather than managing
 * full accounting objects itself, the remaining 10 canonical resources have no
 * confirmed endpoints. All are marked UNVERIFIED because the authoritative
 * API docs could not be accessed without a partner login.
 */

export const metadata = {
  platform: 'a2x',
  totalResources: 13,
  availableResources: ['account', 'invoice', 'organization'],
  unavailableResources: [
    {
      resource: 'bill',
      reason:
        'UNVERIFIED: A2X partner API docs are behind a login wall; no /bills endpoint found in any public source. A2X does not manage supplier bills — it posts settlement summaries to connected accounting platforms.',
    },
    {
      resource: 'contact',
      reason:
        'UNVERIFIED: A2X partner API docs are behind a login wall; no /contacts endpoint found in any public source. Contacts are managed by the downstream accounting system (Xero/QBO), not A2X.',
    },
    {
      resource: 'creditmemo',
      reason:
        'UNVERIFIED: A2X partner API docs are behind a login wall; no /credit-memos endpoint found in any public source. A2X does not issue credit memos as first-class resources.',
    },
    {
      resource: 'expense',
      reason:
        'UNVERIFIED: A2X partner API docs are behind a login wall; no /expenses endpoint found in any public source. Expense management is out of scope for A2X\'s settlement-reconciliation product.',
    },
    {
      resource: 'journal',
      reason:
        'UNVERIFIED: A2X partner API docs are behind a login wall; no /journals endpoint found in any public source. A2X posts journals to connected accounting platforms but does not expose them via its own API.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: A2X partner API docs are behind a login wall; no /orders endpoint found in any public source. Orders are sourced from marketplace platforms (Amazon/Shopify), not stored as A2X API resources.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'UNVERIFIED: A2X partner API docs are behind a login wall; no /purchase-orders endpoint found in any public source. Purchase-order management is not part of A2X\'s settlement-reconciliation scope.',
    },
    {
      resource: 'salesorder',
      reason:
        'UNVERIFIED: A2X partner API docs are behind a login wall; no /sales-orders endpoint found in any public source. Sales orders are marketplace-side data, not A2X API resources.',
    },
    {
      resource: 'taxrate',
      reason:
        'UNVERIFIED: A2X partner API docs are behind a login wall; no /tax-rates endpoint found in any public source. Tax-rate mappings are configured inside A2X but no public API resource has been confirmed.',
    },
    {
      resource: 'transaction',
      reason:
        'UNVERIFIED: A2X partner API docs are behind a login wall; no /transactions endpoint found in any public source. Individual transaction details are aggregated into settlements; A2X does not expose raw transactions via its API.',
    },
  ],
} as const
