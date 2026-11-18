export const metadata = {
  platform: 'avidxchange',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'organization',
    'transaction',
  ],
  unavailableResources: [
    {
      resource: 'invoice',
      reason: 'AvidXchange is an AP-only platform; it has no accounts-receivable module and therefore no AR invoice concept.',
    },
    {
      resource: 'creditmemo',
      reason: 'AvidXchange is AP-only; credit memos are an AR concept not supported by the platform.',
    },
    {
      resource: 'salesorder',
      reason: 'AvidXchange is AP-only; it has no sales order or order-management capability.',
    },
    {
      resource: 'order',
      reason: 'AvidXchange is AP-only; it has no general order-management capability.',
    },
    {
      resource: 'expense',
      reason: 'UNVERIFIED: AvidXchange partner API docs are behind a partner login; no public evidence of an expense endpoint was found. AvidXchange manages vendor AP invoices, not employee expense reports.',
    },
    {
      resource: 'journal',
      reason: 'UNVERIFIED: AvidXchange partner API docs are behind a partner login; no public evidence of a journal-entry endpoint was found.',
    },
    {
      resource: 'purchaseorder',
      reason: 'UNVERIFIED: AvidXchange partner API docs are behind a partner login; PO matching is a UI feature but no purchaseorders REST endpoint is publicly documented.',
    },
    {
      resource: 'taxrate',
      reason: 'UNVERIFIED: AvidXchange partner API docs are behind a partner login; no public evidence of a tax-rate endpoint was found.',
    },
  ],
} as const
