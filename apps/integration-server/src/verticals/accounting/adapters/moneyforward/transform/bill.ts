import type { Bill } from '../../../schema/bill'

// Money Forward does not directly support purchase invoices (bills).
// This module is a stub; the adapter does not implement listBills / getBill.

export interface MoneyForwardStubBill {
  [key: string]: unknown
}

export function transformBill(_raw: MoneyForwardStubBill): Bill {
  return {
    metadata: _raw as Record<string, unknown>,
  }
}
