/**
 * Epos Now Tender -> canonical Transaction.
 *
 * Epos Now "Tenders" are individual payment methods applied to a transaction
 * (e.g. card payment, cash). Each tender is mapped to a canonical Transaction.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

export interface RawEposNowTender {
  Id?: number
  TransactionId?: number
  Amount?: number
  TenderTypeId?: number
  TenderTypeName?: string
  Voided?: boolean
  DateTime?: string
  CreatedDate?: string
  [key: string]: unknown
}

function mapStatus(raw: RawEposNowTender): TransactionStatus {
  if (raw.Voided) return 'FAILURE'
  return 'SUCCESS'
}

function mapKind(_raw: RawEposNowTender): TransactionKind {
  // Epos Now tenders are always completed sales at POS
  return 'SALE'
}

function mapGateway(raw: RawEposNowTender): string {
  if (raw.TenderTypeName) {
    return `eposnow_${raw.TenderTypeName.toLowerCase().replace(/\s+/g, '_')}`
  }
  return 'eposnow'
}

export function transformTransaction(raw: RawEposNowTender): Transaction {
  const currency = 'GBP'
  return {
    id: String(raw.Id ?? ''),
    orderId: raw.TransactionId != null ? String(raw.TransactionId) : undefined,
    kind: mapKind(raw),
    status: mapStatus(raw),
    amount: raw.Amount != null
      ? { amount: majorToMinor(raw.Amount, currency), currency }
      : undefined,
    gateway: mapGateway(raw),
    processedAt: raw.DateTime ?? raw.CreatedDate ?? undefined,
    createdAt: raw.CreatedDate ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
