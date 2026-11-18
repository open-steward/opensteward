import type { Bill } from '../../../schema/bill'

export interface KwaraBill {
  id: string
  [key: string]: unknown
}

export function transformBill(raw: KwaraBill): Bill {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
