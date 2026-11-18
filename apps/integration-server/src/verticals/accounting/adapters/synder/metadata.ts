/**
 * Synder adapter resource coverage.
 *
 * Synder (https://synder.com) is an import-pipeline product. Its public API
 * (https://importer.synder.com/apidocs) exposes only 18 endpoints oriented
 * around uploading CSV/XLSX files and tracking import jobs. There are no
 * read endpoints for accounting resources (accounts, contacts, invoices,
 * bills, journals, etc.). Those concepts exist only as *import targets*
 * inside connected QuickBooks Online / Xero tenants — they cannot be read
 * back through the Synder API.
 */

export const metadata = {
  platform: 'synder',
  totalResources: 13,
  availableResources: ['organization', 'transaction'],
  unavailableResources: [
    {
      resource: 'account',
      reason:
        'Synder Importer API has no endpoint to read chart-of-accounts records; accounts are import targets in QuickBooks/Xero only.',
    },
    {
      resource: 'bill',
      reason:
        'Synder Importer API has no endpoint to read bill records; bills are an import target entity type only.',
    },
    {
      resource: 'contact',
      reason:
        'Synder Importer API has no endpoint to read contact records; contacts are an import target entity type only.',
    },
    {
      resource: 'creditmemo',
      reason:
        'Synder Importer API has no endpoint to read credit memo records; credit memos are an import target entity type only.',
    },
    {
      resource: 'expense',
      reason:
        'Synder Importer API has no endpoint to read expense records; expenses are an import target entity type only.',
    },
    {
      resource: 'invoice',
      reason:
        'Synder Importer API has no endpoint to read invoice records; invoices are an import target entity type only.',
    },
    {
      resource: 'journal',
      reason:
        'Synder Importer API has no endpoint to read journal entry records; journal entries are an import target entity type only.',
    },
    {
      resource: 'order',
      reason:
        'Synder Importer API has no order concept; no read endpoint exists.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Synder Importer API has no endpoint to read purchase order records; purchase orders are an import target entity type only.',
    },
    {
      resource: 'salesorder',
      reason:
        'Synder Importer API has no sales order concept; no read endpoint exists.',
    },
    {
      resource: 'taxrate',
      reason:
        'Synder Importer API has no endpoint to read tax rate records; tax is handled inside the connected QuickBooks/Xero tenant.',
    },
  ],
} as const
