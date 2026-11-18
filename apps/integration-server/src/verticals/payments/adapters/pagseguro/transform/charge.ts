/**
 * PagBank charge (GET /charges/{charge_id}) -> canonical Charge.
 *
 * Fields follow the documented charge object,
 * https://developer.pagbank.com.br/reference/objeto-charge.md, and the example
 * body of https://developer.pagbank.com.br/reference/consultar-pagamento.md:
 * - amount.value: "Valor a ser cobrado em centavos." (already minor units)
 * - amount.currency: "Código de moeda ISO de três letras, em maiúsculas."
 * - amount.summary.paid / .refunded: "Valor que foi pago na cobrança." /
 *   "Valor que foi devolvido da Cobrança."
 * - status: AUTHORIZED, PAID, IN_ANALYSIS, DECLINED, CANCELED, WAITING.
 * - paid_at: "Data e horário em que a cobrança foi paga (capturada)."
 * - payment_response.code / .message: the provider's authorisation response.
 * - payment_method.card.id: "Identificador PagBank do Cartão de Crédito salvo".
 * - payment_method.soft_descriptor: "Nome na Fatura do cliente".
 * The charge object documents no customer id, metadata or update timestamp, so
 * those canonical fields are left empty.
 */

import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime, pickStr } from './shared'

export interface RawPagseguroCharge {
  id: string
  reference_id?: string | null
  status?: string | null
  created_at?: string | null
  paid_at?: string | null
  description?: string | null
  amount?: {
    value?: number | null
    currency?: string | null
    summary?: { total?: number | null; paid?: number | null; refunded?: number | null } | null
  } | null
  payment_response?: {
    code?: number | string | null
    message?: string | null
    reference?: string | null
  } | null
  payment_method?: {
    type?: string | null
    capture?: boolean | null
    soft_descriptor?: string | null
    card?: { id?: string | null } | null
  } | null
  [key: string]: unknown
}

const STATUS: Record<string, ChargeStatus> = {
  AUTHORIZED: 'pending',
  IN_ANALYSIS: 'pending',
  WAITING: 'pending',
  PAID: 'succeeded',
  DECLINED: 'failed',
  CANCELED: 'cancelled',
}

function mapStatus(raw: RawPagseguroCharge): ChargeStatus {
  const refunded = raw.amount?.summary?.refunded
  const total = raw.amount?.summary?.total
  if (typeof refunded === 'number' && refunded > 0 && typeof total === 'number') {
    return refunded >= total ? 'refunded' : 'partially_refunded'
  }
  return (typeof raw.status === 'string' && STATUS[raw.status]) || 'unknown'
}

export function transformCharge(raw: RawPagseguroCharge): Charge {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('PagBank charge has no id')
  }
  const value = raw.amount?.value
  const currency = raw.amount?.currency
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`PagBank charge ${raw.id} has no amount.value`)
  }
  if (typeof currency !== 'string' || currency === '') {
    throw new Error(`PagBank charge ${raw.id} has no amount.currency`)
  }
  const summary = raw.amount?.summary
  const declined = raw.status === 'DECLINED'
  const responseCode = raw.payment_response?.code
  return {
    id: raw.id,
    externalId: raw.id,
    amount: value,
    currency,
    amountRefunded: typeof summary?.refunded === 'number' ? summary.refunded : undefined,
    amountCaptured: typeof summary?.paid === 'number' ? summary.paid : undefined,
    status: mapStatus(raw),
    captured: raw.status === 'PAID' ? true : raw.status === 'AUTHORIZED' ? false : undefined,
    capturedAt: toIsoDatetime(raw.paid_at),
    paymentMethodId: pickStr(raw.payment_method?.card?.id),
    description: pickStr(raw.description),
    statementDescriptor: pickStr(raw.payment_method?.soft_descriptor),
    failureCode: declined && responseCode != null ? String(responseCode) : undefined,
    failureMessage: declined ? pickStr(raw.payment_response?.message) : undefined,
    gateway: 'pagseguro',
    metadata: {},
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
