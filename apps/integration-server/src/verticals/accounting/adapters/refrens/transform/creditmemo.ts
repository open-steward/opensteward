/**
 * Refrens credit memo transform.
 *
 * Refrens does not document a dedicated credit-memo endpoint. This file is
 * present for interface completeness; the adapter does not implement
 * listCreditMemos / getCreditMemo / createCreditMemo.
 */

import type { CreditMemo } from '../../../schema/creditmemo'

// Placeholder shape
export interface RefrensCreditMemo {
  _id: string
  [key: string]: unknown
}

export function transformCreditMemo(raw: RefrensCreditMemo): CreditMemo {
  return {
    id: raw._id,
    metadata: raw as Record<string, unknown>,
  }
}
