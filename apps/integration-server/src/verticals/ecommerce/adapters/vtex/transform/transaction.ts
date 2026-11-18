/**
 * VTEX payment transaction → canonical Transaction.
 *
 * VTEX orders include a `paymentData.transactions` array. Each transaction
 * contains one or more `payments` describing the actual authorizations,
 * captures, or refunds.
 *
 * Canonical id: `{orderId}:{transactionId}:{paymentId}` (composite key).
 *
 * VTEX money values are in integer minor units (centavos/cents); no conversion needed.
 *
 * Docs: https://developers.vtex.com/vtex-rest-api/reference/getorder
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'

// ── Raw VTEX payment shapes ───────────────────────────────────────────────────

export interface RawVtexPayment {
  id?: string
  paymentSystemName?: string | null  // e.g. 'Visa', 'Boleto Bancário', 'Pix'
  paymentSystem?: number | null
  value?: number | null
  installments?: number | null
  referenceValue?: number | null
  giftCardCaption?: string | null
  redemptionCode?: string | null
  group?: string | null
  tid?: string | null
  authId?: string | null
  connectorResponses?: {
    Tid?: string
    ReturnCode?: string
    Message?: string
    [key: string]: unknown
  } | null
  bankIssuedInvoiceIdentificationNumber?: string | null
  bankIssuedInvoiceIdentificationNumberFormatted?: string | null
  bankIssuedInvoiceBarCodeNumber?: string | null
  bankIssuedInvoiceBarCodeType?: string | null
  bankIssuedInvoiceUrl?: string | null
  billingAddress?: Record<string, unknown> | null
  status?: string | null
  /** 'APPROVED', 'DENIED', 'CANCELLED', 'UNDEFINED', 'VOIDED', etc. */
  lastChangeDate?: string | null
  [key: string]: unknown
}

export interface RawVtexTransaction {
  transactionId?: string
  merchantName?: string | null
  payments?: RawVtexPayment[]
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(status: string | null | undefined): TransactionStatus | undefined {
  if (!status) return undefined
  const s = status.toUpperCase()
  if (s === 'APPROVED' || s === 'AUTHORIZED' || s === 'SETTLED') return 'SUCCESS'
  if (s === 'PENDING' || s === 'UNDEFINED') return 'PENDING'
  if (s === 'DENIED' || s === 'CANCELLED' || s === 'VOIDED') return 'FAILURE'
  return undefined
}

// ── Kind mapping ──────────────────────────────────────────────────────────────

function mapKind(payment: RawVtexPayment): TransactionKind | undefined {
  const status = (payment.status ?? '').toUpperCase()
  if (status === 'APPROVED' && !payment.authId) return 'CAPTURE'
  if (payment.authId) return 'AUTHORIZATION'
  return 'SALE'
}

// ── Main transform ────────────────────────────────────────────────────────────

export function transformTransaction(
  payment: RawVtexPayment,
  txn: RawVtexTransaction,
  orderId: string,
): Transaction {
  const id = [orderId, txn.transactionId, payment.id].filter(Boolean).join(':')
  const currency = 'BRL' // VTEX is Brazil-native; amounts are in BRL minor units

  return {
    id,
    orderId,
    kind: mapKind(payment),
    status: mapStatus(payment.status),
    amount: payment.value != null
      ? {
          amount: payment.value, // VTEX already in minor units (centavos)
          currency,
        }
      : undefined,
    gateway: payment.paymentSystemName ?? undefined,
    authorizationCode: payment.authId ?? payment.tid ?? undefined,
    processedAt: payment.lastChangeDate ?? undefined,
    createdAt: payment.lastChangeDate ?? undefined,
    metadata: { ...payment, transactionId: txn.transactionId, orderId } as unknown as Record<string, unknown>,
  }
}
