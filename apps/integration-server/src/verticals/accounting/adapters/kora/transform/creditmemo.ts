import type { CreditMemo } from '../../../schema/creditmemo'

// Kora does not expose credit memo endpoints.
export interface KoraStubCreditMemo {
  [key: string]: unknown
}

export function transformCreditMemo(raw: KoraStubCreditMemo): CreditMemo {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
