import type { Bill } from '../../../schema/bill'

// Paga does not expose bill endpoints.
export interface PagaStubBill {
  [key: string]: unknown
}

export function transformBill(raw: PagaStubBill): Bill {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
