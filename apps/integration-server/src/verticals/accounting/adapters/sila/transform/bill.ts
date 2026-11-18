import type { Bill } from '../../../schema/bill'

// Sila does not expose bill endpoints.
export interface SilaStubBill {
  [key: string]: unknown
}

export function transformBill(raw: SilaStubBill): Bill {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
