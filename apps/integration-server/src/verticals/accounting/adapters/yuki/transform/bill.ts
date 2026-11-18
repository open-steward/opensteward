/**
 * Yuki does not expose purchase/supplier invoice data through its standard
 * SOAP API. The Purchase webservice requires a separate formal request to
 * support@yuki.nl and issuance of a Client ID/Secret. Accordingly, bill
 * operations are not implemented for this adapter — the interface methods are
 * omitted from index.ts and the adapter returns 501 via the framework default.
 *
 * This file is retained as a placeholder to keep the transform directory
 * consistent across adapters.
 */

import type { Bill } from '../../../schema/bill'

export interface YukiBill {
  [key: string]: unknown
}

export function transformBill(_raw: YukiBill): Bill {
  throw new Error('Yuki: bill (purchase invoice) endpoint is not available without special API access')
}
