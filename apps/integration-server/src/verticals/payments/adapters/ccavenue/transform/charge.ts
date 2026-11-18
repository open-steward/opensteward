import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

/**
 * Raw `Order_Status_Result` payload from the CCAvenue `orderStatusTracker`
 * command (the decrypted JSON `enc_response`). Field names mirror the API
 * exactly, including the upstream's `order_currncy` misspelling.
 */
export interface RawCcavenueOrderStatus {
  reference_no?: string | number
  order_no?: string
  order_currncy?: string
  order_amt?: number | string
  order_capt_amt?: number | string
  order_gross_amt?: number | string
  order_date_time?: string
  order_status_date_time?: string
  order_status?: string
  order_bill_name?: string
  order_bill_email?: string
  order_bill_tel?: string
  order_bank_ref_no?: string
  order_bank_response?: string
  order_card_name?: string
  order_option_type?: string
  order_gtw_id?: string
  order_fraud_status?: string
  order_device_type?: string
  order_notes?: string
  status?: number | string
  error_code?: string
  error_desc?: string
  [k: string]: unknown
}

/**
 * Map a CCAvenue `order_status` string to the canonical ChargeStatus.
 * CCAvenue statuses are human-readable phrases (e.g. "Successful",
 * "Aborted", "Refunded", "System refund").
 */
function mapStatus(raw: RawCcavenueOrderStatus): ChargeStatus {
  const status = (raw.order_status ?? '').trim().toLowerCase()
  switch (status) {
    case 'successful':
    case 'shipped':
      return 'succeeded'
    case 'refunded':
    case 'system refund':
      return 'refunded'
    case 'aborted':
    case 'cancelled':
    case 'auto-cancelled':
    case 'auto-reversed':
      return 'cancelled'
    case 'unsuccessful':
    case 'fraud':
    case 'invalid':
    case 'chargeback':
      return 'failed'
    case 'initiated':
    case 'awaited':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawCcavenueOrderStatus): Charge {
  const id = String(raw.reference_no ?? raw.order_no ?? '')
  const capt = toMinorUnits(raw.order_capt_amt)
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.order_amt),
    currency: pickCurrency(pickStr(raw.order_currncy)),
    amountCaptured: capt > 0 ? capt : undefined,
    status: mapStatus(raw),
    captured: capt > 0 ? true : undefined,
    description: pickStr(raw.order_notes),
    receiptEmail: pickStr(raw.order_bill_email),
    gateway: 'ccavenue',
    metadata: strMap({
      order_no: raw.order_no,
      order_bank_ref_no: raw.order_bank_ref_no,
      order_bank_response: raw.order_bank_response,
      order_card_name: raw.order_card_name,
      order_option_type: raw.order_option_type,
      order_gtw_id: raw.order_gtw_id,
      order_fraud_status: raw.order_fraud_status,
      order_device_type: raw.order_device_type,
      order_bill_name: raw.order_bill_name,
      order_bill_tel: raw.order_bill_tel,
      order_status: raw.order_status,
    }),
    createdAt: toIsoDatetime(raw.order_date_time),
    updatedAt: toIsoDatetime(raw.order_status_date_time),
    raw,
  }
}
