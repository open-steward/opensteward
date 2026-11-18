import type { Payout, PayoutStatus } from '../../../schema/payout'

/**
 * One withdrawal ("saque") as GET /v1/withdraw_requests and
 * GET /v1/withdraw_requests/{id} document it
 * (https://dev.iugu.com/reference/listar-transferencia-bancaria,
 * https://dev.iugu.com/reference/buscar-transferencia-bancaria).
 * Only the fields this transform reads are typed.
 */
export interface RawIuguWithdrawRequest {
  id: string
  status: string
  created_at?: string | null
  updated_at?: string | null
  /** A formatted string, e.g. "R$ 5,00" — the docs give no integer amount. */
  amount: string
  feedback?: string | null
  [k: string]: unknown
}

/**
 * The documented status values: "pending, processing, accepted, rejected,
 * inconsistent, refunded, partially_refunded, reprocessing" (listar-
 * transferencia-bancaria). `accepted` is the bank accepting the transfer
 * ("data[rejected_after_accepted] Informa se o banco aceitou sim ou não a
 * transferência", https://dev.iugu.com/docs/saque). `inconsistent`,
 * `refunded` and `partially_refunded` have no documented meaning that maps
 * to a canonical payout state, so they read as 'unknown'.
 */
const STATUS: Record<string, PayoutStatus> = {
  pending: 'pending',
  processing: 'in_transit',
  reprocessing: 'in_transit',
  accepted: 'paid',
  rejected: 'failed',
}

function mapPayoutStatus(s: string): PayoutStatus {
  return STATUS[s] ?? 'unknown'
}

/**
 * "R$ 5,00" → 500 minor units of BRL. The docs' only amount is this
 * formatted string; "R$" is the Brazilian real's symbol, so the currency
 * comes from the documented value rather than a default. The two decimal
 * places are the centavos, so the minor units are the digits themselves —
 * no scaling. Anything else throws rather than guessing.
 */
const BRL_AMOUNT = /^R\$\s*(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/

export function parseIuguAmount(amount: unknown): { amount: number; currency: string } {
  const m = typeof amount === 'string' ? BRL_AMOUNT.exec(amount.trim()) : null
  if (!m) throw new Error(`iugu withdraw_request: unrecognised amount ${JSON.stringify(amount)}`)
  return { amount: Number(`${m[1]!.replace(/\./g, '')}${m[2]!}`), currency: 'BRL' }
}

export function transformPayout(raw: RawIuguWithdrawRequest): Payout {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('iugu withdraw_request without an id')
  }
  const money = parseIuguAmount(raw.amount)
  return {
    id: raw.id,
    externalId: raw.id,
    amount: money.amount,
    currency: money.currency,
    status: mapPayoutStatus(raw.status),
    failureMessage: raw.feedback ?? undefined,
    gateway: 'iugu',
    metadata: {},
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    raw,
  }
}
