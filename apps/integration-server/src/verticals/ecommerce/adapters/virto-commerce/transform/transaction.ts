/**
 * Virto Commerce PaymentIn → canonical Transaction.
 *
 * Docs: live demo Swagger, `VirtoCommerce.Orders/swagger.json` →
 * `components.schemas.PaymentIn` / `PaymentGatewayTransaction`.
 */
import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'

export type RawVirtoPaymentStatus =
  | 'New' | 'Pending' | 'Authorized' | 'Paid' | 'PartiallyRefunded' | 'Refunded'
  | 'Voided' | 'Custom' | 'Cancelled' | 'Declined' | 'Error'

export interface RawVirtoGatewayTransaction {
  responseCode?: string
  processError?: string
  [key: string]: unknown
}

export interface RawVirtoPaymentInDetail {
  id: string
  orderId?: string
  gatewayCode?: string
  paymentStatus?: RawVirtoPaymentStatus
  total?: number
  currency?: string
  incomingDate?: string
  authorizedDate?: string
  capturedDate?: string
  transactions?: RawVirtoGatewayTransaction[]
  [key: string]: unknown
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  New: 'PENDING',
  Pending: 'PENDING',
  Authorized: 'SUCCESS',
  Paid: 'SUCCESS',
  PartiallyRefunded: 'SUCCESS',
  Refunded: 'SUCCESS',
  Voided: 'SUCCESS',
  Declined: 'FAILURE',
  Cancelled: 'FAILURE',
  Error: 'ERROR',
}

const KIND_MAP: Record<string, TransactionKind> = {
  Authorized: 'AUTHORIZATION',
  Paid: 'CAPTURE',
  PartiallyRefunded: 'REFUND',
  Refunded: 'REFUND',
  Voided: 'VOID',
}

export function transformTransaction(raw: RawVirtoPaymentInDetail): Transaction {
  const last = raw.transactions?.[raw.transactions.length - 1]
  return {
    id: raw.id,
    orderId: raw.orderId,
    kind: KIND_MAP[raw.paymentStatus ?? ''] ?? undefined,
    status: STATUS_MAP[raw.paymentStatus ?? ''] ?? 'unknown',
    // `amount` is optional — omitted (never defaulted to a guessed
    // currency) when either half of the Money is unreported.
    amount:
      raw.total != null && raw.currency != null
        ? { amount: Math.round(raw.total * 100), currency: raw.currency }
        : undefined,
    gateway: raw.gatewayCode,
    errorCode: last?.responseCode,
    errorMessage: last?.processError,
    processedAt: raw.capturedDate ?? raw.authorizedDate ?? raw.incomingDate,
    createdAt: raw.incomingDate,
    metadata: { ...raw },
  }
}
