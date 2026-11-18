import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * A BillDesk Transaction is the captured payment attempt and maps onto the
 * canonical Charge. The Order-create response is also charge-shaped (it carries
 * an `orderid`/`bdorderid`, amount and currency but no transaction yet), so
 * this transform accepts either shape and falls back gracefully when fields
 * are absent.
 */
export interface RawBilldeskTransaction {
  objectid?: string
  transactionid?: string
  // Order-create responses carry `bdorderid` instead of a transaction id.
  bdorderid?: string
  orderid?: string
  mercid?: string
  transaction_date?: string
  order_date?: string
  createdon?: string
  amount?: string
  charge_amount?: string
  surcharge?: string
  discount?: string
  currency?: string
  // Transactions: auth_status ("0300" success / "0002" pending / "0399" failed).
  auth_status?: string
  // Orders: status ("ACTIVE" / "EXPIRED" / ...).
  status?: string
  bank_ref_no?: string
  payment_method_type?: string
  txn_process_type?: string
  transaction_error_code?: string
  transaction_error_desc?: string
  transaction_error_type?: string
  additional_info?: Record<string, unknown>
  [k: string]: unknown
}

/**
 * BillDesk transaction `auth_status` codes:
 *   0300 → captured/successful   0002 → pending/initiated
 *   0399 → failed/declined       others → pending (unknown intermediate state)
 * Order-create responses have no `auth_status`; their `status: ACTIVE` means
 * the order is awaiting payment → pending.
 */
function mapStatus(raw: RawBilldeskTransaction): ChargeStatus {
  const auth = (raw.auth_status ?? '').trim()
  if (auth) {
    switch (auth) {
      case '0300':
        return 'succeeded'
      case '0399':
        return 'failed'
      case '0002':
        return 'pending'
      default:
        return 'pending'
    }
  }
  // Order-create / no transaction yet.
  switch ((raw.status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'pending'
    case 'EXPIRED':
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawBilldeskTransaction): Charge {
  const status = mapStatus(raw)
  const id = String(raw.transactionid ?? raw.bdorderid ?? raw.orderid ?? '')
  const createdAt = toIsoDatetime(raw.transaction_date ?? raw.order_date ?? raw.createdon)
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    status,
    captured: status === 'succeeded',
    capturedAt: status === 'succeeded' ? createdAt : undefined,
    // BillDesk has no customer resource; the merchant order id is the closest grouping key.
    invoiceId: raw.orderid ? String(raw.orderid) : undefined,
    failureCode:
      raw.transaction_error_type === 'success' ? undefined : raw.transaction_error_code,
    failureMessage:
      raw.transaction_error_type === 'success' ? undefined : raw.transaction_error_desc,
    gateway: 'billdesk',
    metadata: strMap({
      mercid: raw.mercid,
      bdorderid: raw.bdorderid,
      bank_ref_no: raw.bank_ref_no,
      payment_method_type: raw.payment_method_type,
      txn_process_type: raw.txn_process_type,
      auth_status: raw.auth_status,
      surcharge: raw.surcharge,
      discount: raw.discount,
      charge_amount: raw.charge_amount,
      ...raw.additional_info,
    }),
    createdAt,
    updatedAt: createdAt,
    raw,
  }
}
