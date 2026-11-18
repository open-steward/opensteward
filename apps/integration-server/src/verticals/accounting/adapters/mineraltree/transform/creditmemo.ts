/**
 * MineralTree vendor credit → canonical CreditMemo transform.
 *
 * Endpoint: GET /mtapi/base/services/credit/{companyId}
 *
 * MineralTree credits represent AP credits issued by vendors — the reverse
 * of a bill. The `status` field maps Open/Settled/Voided.
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import { toMinorUnits } from './money'

interface MtMoney {
  amount?: number
  currency?: string
}

export interface MtCredit {
  id?: string
  externalId?: string
  creditNumber?: string
  vendor?: { id?: string; name?: string }
  amount?: MtMoney
  status?: string   // Open | Settled | Voided
  transactionDate?: string  // yyyy-MM-dd
  memo?: string
  [key: string]: unknown
}

function mapStatus(status?: string): CreditMemoStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'settled': return 'PAID'
    case 'voided': return 'VOIDED'
    case 'open': return 'AUTHORIZED'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: MtCredit): CreditMemo {
  return {
    id: raw.id || undefined,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.creditNumber ?? raw.externalId ?? undefined,
    contactId: raw.vendor?.id || undefined,
    currency: raw.amount?.currency || undefined,
    totalAmount: toMinorUnits(raw.amount?.amount),
    notes: raw.memo || undefined,
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
