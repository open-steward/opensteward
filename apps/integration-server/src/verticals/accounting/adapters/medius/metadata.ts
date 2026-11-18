/**
 * Medius AP Automation – adapter resource coverage metadata.
 *
 * Medius is an AP Automation platform. Its public REST integration API
 * (confirmed via official OpenAPI spec at github.com/medius-group/medius-api)
 * covers only accounts-payable and procurement workflows. It has no
 * chart-of-accounts, AR invoice, expense, journal, tax-rate, credit-memo,
 * order, sales-order, or transaction endpoints.
 */

export const metadata = {
  platform: 'medius',
  totalResources: 13,
  availableResources: [
    'bill',
    'contact',
    'organization',
    'purchaseorder',
  ],
  unavailableResources: [
    {
      resource: 'account',
      reason: 'Medius has no chart-of-accounts REST endpoint; the API is AP/procurement only (confirmed via official OpenAPI spec)',
    },
    {
      resource: 'creditmemo',
      reason: 'Medius has no credit memo or credit note endpoint; AP-only platform with no AR functionality',
    },
    {
      resource: 'expense',
      reason: 'Medius has no expense management endpoint; expense reports are out of scope for this AP Automation product',
    },
    {
      resource: 'invoice',
      reason: 'Medius has no customer (AR) invoice endpoint; supplier invoices are bills (AP side) already mapped',
    },
    {
      resource: 'journal',
      reason: 'Medius has no journal entry REST endpoint; general ledger is managed in the connected ERP, not Medius',
    },
    {
      resource: 'order',
      reason: 'Medius has no generic order endpoint; purchase orders are already mapped, but no general order concept exists',
    },
    {
      resource: 'salesorder',
      reason: 'Medius has no sales order endpoint; it is an AP/procurement platform with no AR or sales-order functionality',
    },
    {
      resource: 'taxrate',
      reason: 'Medius has no tax rate export endpoint; tax groups can be imported but not read back via REST',
    },
    {
      resource: 'transaction',
      reason: 'Medius has no general transaction endpoint; payment batches exist for AP only (not canonical Transaction)',
    },
  ],
} as const
