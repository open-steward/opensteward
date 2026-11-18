import type { Charge, ChargeStatus } from '../../../schema/charge'
import { DEFAULT_CURRENCY } from '../constants'
import { strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * An Easebuzz transaction as returned by `POST /transaction/v2/retrieve` (and
 * carried, with the same field names, in the transaction webhook). All values
 * arrive as strings.
 */
export interface RawEasebuzzTransaction {
  txnid?: string
  easepayid?: string
  status?: string
  amount?: string
  net_amount_debit?: string
  email?: string
  phone?: string
  firstname?: string
  productinfo?: string
  mode?: string
  payment_source?: string
  pg_type?: string
  bank_ref_num?: string
  bankcode?: string
  card_type?: string
  cardCategory?: string
  name_on_card?: string
  addedon?: string
  error?: string
  error_Message?: string
  upi_va?: string
  [k: string]: unknown
}

function mapStatus(raw: RawEasebuzzTransaction): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'success':
    case 'completed':
      return 'succeeded'
    case 'pending':
    case 'initiated':
      return 'pending'
    case 'failure':
    case 'failed':
    case 'bounced':
      return 'failed'
    case 'usercancelled':
    case 'user_cancelled':
      return 'cancelled'
    case 'refunded':
      return 'refunded'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawEasebuzzTransaction): Charge {
  const id = String(raw.easepayid ?? raw.txnid ?? '')
  const failureMessage = raw.error_Message || raw.error || undefined
  return {
    id,
    externalId: String(raw.txnid ?? raw.easepayid ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: DEFAULT_CURRENCY,
    status: mapStatus(raw),
    description: raw.productinfo || undefined,
    receiptEmail: raw.email || undefined,
    failureMessage,
    gateway: 'easebuzz',
    metadata: strMap({
      easepayid: raw.easepayid,
      raw_status: raw.status,
      mode: raw.mode,
      payment_source: raw.payment_source,
      pg_type: raw.pg_type,
      bank_ref_num: raw.bank_ref_num,
      bankcode: raw.bankcode,
      card_type: raw.card_type,
      card_category: raw.cardCategory,
      name_on_card: raw.name_on_card,
      firstname: raw.firstname,
      phone: raw.phone,
      net_amount_debit: raw.net_amount_debit,
      upi_va: raw.upi_va,
    }),
    createdAt: toIsoDatetime(raw.addedon),
    updatedAt: toIsoDatetime(raw.addedon),
    raw,
  }
}
