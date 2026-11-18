import type { CreditMemo } from '../../../schema/creditmemo'

export interface KwaraCreditMemo {
  id: string
  [key: string]: unknown
}

export function transformCreditMemo(raw: KwaraCreditMemo): CreditMemo {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
