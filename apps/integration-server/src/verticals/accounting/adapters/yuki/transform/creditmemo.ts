/**
 * Yuki does not expose credit memos via its standard SOAP API.
 * This file is retained as a placeholder; the adapter does not implement
 * credit memo operations — they auto-501 via the framework default.
 */

import type { CreditMemo } from '../../../schema/creditmemo'

export interface YukiCreditMemo {
  [key: string]: unknown
}

export function transformCreditMemo(_raw: YukiCreditMemo): CreditMemo {
  throw new Error('Yuki: credit memo endpoint is not available in the SOAP API')
}
