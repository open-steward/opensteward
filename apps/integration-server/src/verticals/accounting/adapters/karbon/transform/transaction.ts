/**
 * Karbon Payment → canonical Transaction transform.
 *
 * Karbon Payment resource: GET /v3/Payments, GET /v3/Payments/{PaymentKey}
 */
import type { Transaction, TransactionContact } from '../../../schema/transaction'

// ── Karbon raw types ──────────────────────────────────────────────────────────

export interface KarbonPaymentClient {
  ClientKey?: string
  ClientType?: string
  Name?: string
}

export interface KarbonPaymentKarbonPayment {
  CardType?: string
  CardCountry?: string | null
  CardFunding?: string
  PayoutStatus?: string
  SurchargeAmount?: number
  KarbonFeeAmount?: number
  KarbonFeeTaxAmount?: number
  NetAmount?: number
}

export interface KarbonPayment {
  PaymentKey: string
  InvoiceKey?: string
  PaymentReference?: string
  PaymentType?: string
  PaymentDate?: string
  GrossAmount?: number
  PaymentMethod?: string
  KarbonPayment?: KarbonPaymentKarbonPayment
  Client?: KarbonPaymentClient | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformPayment(raw: KarbonPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.Client?.ClientKey) {
    contacts.push({
      id: raw.Client.ClientKey,
      name: raw.Client.Name || undefined,
    })
  }

  return {
    id: raw.PaymentKey,
    type: raw.PaymentType || undefined,
    reference: raw.InvoiceKey || undefined,
    memo: raw.PaymentReference || undefined,
    paymentMethod: raw.PaymentMethod || undefined,
    totalAmount: raw.GrossAmount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.PaymentDate ? new Date(raw.PaymentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
