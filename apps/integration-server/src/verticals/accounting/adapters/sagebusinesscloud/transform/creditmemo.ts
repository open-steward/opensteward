import type { CreditMemo } from '../../../schema/creditmemo'

export interface SageCreditMemo {
  id: string
  credit_note_number?: string
  [key: string]: unknown
}

export function transformCreditMemo(raw: SageCreditMemo): CreditMemo {
  return {
    id: raw.id,
    creditmemoNumber: raw.credit_note_number || raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
