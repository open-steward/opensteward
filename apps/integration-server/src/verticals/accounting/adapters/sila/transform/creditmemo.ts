import type { CreditMemo } from '../../../schema/creditmemo'

// Sila does not expose credit memo endpoints.
export interface SilaStubCreditMemo {
  [key: string]: unknown
}

export function transformCreditMemo(raw: SilaStubCreditMemo): CreditMemo {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
