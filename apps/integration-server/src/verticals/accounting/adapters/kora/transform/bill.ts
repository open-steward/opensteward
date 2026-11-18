import type { Bill } from '../../../schema/bill'

// Kora does not expose a bills endpoint.
export interface KoraStubBill {
  [key: string]: unknown
}

export function transformBill(raw: KoraStubBill): Bill {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
