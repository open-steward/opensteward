/**
 * Allegro Payment Operation → canonical Transaction.
 *
 * Allegro's payments are accessible through checkout form payment data.
 * We derive transactions from the payment information on checkout forms.
 *
 * Each checkout form has a `payment` object with payment details.
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawAllegroMoney {
  amount: string
  currency: string
}

export interface RawAllegroPaymentOperation {
  id: string
  type?: string
  group?: string
  payment?: {
    id?: string
  }
  wallet?: {
    paymentId?: string
    balance?: RawAllegroMoney
  }
  occurredAt?: string
  value?: RawAllegroMoney
  participant?: {
    id?: string
    companyName?: string
  }
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const KIND_MAP: Record<string, TransactionKind> = {
  INCOME: 'SALE',
  OUTCOME: 'CAPTURE',
  REFUND: 'REFUND',
  SURCHARGE: 'CAPTURE',
  CORRECTION: 'CAPTURE',
  CONTRIBUTION: 'CAPTURE',
  PAYOUT: 'CAPTURE',
  BLOCKADE: 'AUTHORIZATION',
  RELEASE: 'VOID',
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  INCOME: 'SUCCESS',
  OUTCOME: 'SUCCESS',
  REFUND: 'SUCCESS',
  BLOCKADE: 'PENDING',
  RELEASE: 'SUCCESS',
}

function toMoney(m: RawAllegroMoney | undefined):
  | { amount: number; currency: string }
  | undefined {
  if (!m) return undefined
  const n = parseFloat(m.amount)
  if (Number.isNaN(n)) return undefined
  return { amount: majorToMinor(Math.abs(n), m.currency), currency: m.currency }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawAllegroPaymentOperation): Transaction {
  const kind = KIND_MAP[raw.type ?? ''] ?? 'CAPTURE'
  const status = STATUS_MAP[raw.type ?? ''] ?? 'SUCCESS'
  const amount = toMoney(raw.value)

  return {
    id: raw.id,
    orderId: raw.payment?.id ?? raw.wallet?.paymentId,
    kind,
    status,
    amount,
    gateway: 'allegro',
    processedAt: raw.occurredAt,
    createdAt: raw.occurredAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
