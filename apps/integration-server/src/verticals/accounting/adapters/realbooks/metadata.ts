/**
 * RealBooks adapter resource coverage metadata.
 *
 * Source: official RealBooks API documentation PDF
 * (https://www.realbooks.in/wp-content/uploads/2024/03/api_documentation.pdf)
 *
 * The RealBooks public API is POST-only and exposes a limited set of
 * endpoints — primarily Inventory Vouchers, Account Vouchers, and Ledger
 * Masters. Several canonical accounting resources have no corresponding
 * server-side endpoint in the documented API.
 */

export const metadata = {
  platform: 'realbooks',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'invoice',
    'journal',
    'organization',
  ],
  unavailableResources: [
    {
      resource: 'creditmemo',
      reason:
        'UNVERIFIED: RealBooks has device-specific Sale Return APIs (saleReturnMultiple / saleReturnNew) that require deviceId/deviceOs credentials not available in a server-side context; server-side list/read of sale-return vouchers is not documented in the official API PDF.',
    },
    {
      resource: 'expense',
      reason:
        'RealBooks has no dedicated expense endpoint; payment/receipt vouchers (account vouchers) are write-only via vcreate — no server-side list or read API for payment/expense records is documented.',
    },
    {
      resource: 'order',
      reason:
        'RealBooks has no order resource; order numbers appear only as a field (orderNo) embedded within inventory vouchers, not as a separate listable resource.',
    },
    {
      resource: 'purchaseorder',
      reason:
        'RealBooks has no purchase order endpoint; purchaseOrderNumber / purchaseOrderDate are fields within inventory vouchers only, not a separate resource with a dedicated API.',
    },
    {
      resource: 'salesorder',
      reason:
        'RealBooks has no sales order endpoint; order identifiers appear only as a field (orderNo) within inventory vouchers, not as a separate resource.',
    },
    {
      resource: 'taxrate',
      reason:
        'RealBooks has no tax rate list endpoint; GST / tax rates appear only as embedded itemTax / taxLedger arrays within voucher payloads — no dedicated rate-list API is documented.',
    },
    {
      resource: 'transaction',
      reason:
        'RealBooks has no account-level transaction list endpoint; the fetchBillDetails report covers inventory vouchers only, and account vouchers (payments, receipts) have no corresponding server-side list/read API.',
    },
  ],
} as const
