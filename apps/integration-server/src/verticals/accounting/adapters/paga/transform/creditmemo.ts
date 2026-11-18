import type { CreditMemo } from '../../../schema/creditmemo'

// Paga does not expose credit memo endpoints.
export interface PagaStubCreditMemo {
  [key: string]: unknown
}

export function transformCreditMemo(raw: PagaStubCreditMemo): CreditMemo {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
