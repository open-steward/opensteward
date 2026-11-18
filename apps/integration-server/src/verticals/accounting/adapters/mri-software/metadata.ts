export const metadata = {
  platform: 'mri-software',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'journal',
    'purchaseorder',
    'taxrate',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason:
        'MRI Software accounting API has no credit memo or credit note endpoint; payables are handled exclusively via Bills.',
    },
    {
      resource: 'expense',
      reason:
        'MRI Software accounting API does not expose employee expense reports or expense claims.',
    },
    {
      resource: 'invoice',
      reason:
        'MRI Software does not expose AR invoices; the platform models payables as Bills and has no accounts-receivable invoice endpoint.',
    },
    {
      resource: 'order',
      reason:
        'MRI Software accounting API has no general order endpoint; the documented resources are limited to Bills, Purchase Orders, Journal Entries, Accounts, Tax Rates, and Contacts.',
    },
    {
      resource: 'organization',
      reason:
        'UNVERIFIED: A Subsidiaries endpoint is listed in MRI\'s connector catalogue but the full API reference requires partner-portal login; cannot confirm whether a single-org record is retrievable or what fields are returned.',
    },
    {
      resource: 'salesorder',
      reason:
        'MRI Software accounting API has no sales order endpoint; the platform is property-management-focused and does not model sales orders.',
    },
    {
      resource: 'transaction',
      reason:
        'MRI Software does not expose a dedicated transactions endpoint; GL transactions are accessible only via Journal Entries (already implemented).',
    },
  ],
} as const
