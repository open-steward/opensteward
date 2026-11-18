import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { grossMinor, pickCurrency, strMap, type TaxedMoney } from './shared'

/**
 * A Billie "order" is the financed B2B transaction — the closest analogue to a
 * canonical Charge. Money is `TaxedMoney` decimals in euros; `state` follows
 * the OrderStateV2 enum.
 *
 * Docs: https://docs.billie.io/reference/order_get_details_v2
 */
export interface RawBillieDebtor {
  name?: string | null
  company_address?: Record<string, unknown> | null
  billing_address?: Record<string, unknown> | null
  external_data?: { merchant_customer_id?: string | null } | null
  [k: string]: unknown
}

export interface RawBillieOrderInvoice {
  uuid?: string
  invoice_number?: string | null
  state?: string | null
  [k: string]: unknown
}

export interface RawBillieOrder {
  uuid?: string
  external_code?: string | null
  state?: string | null
  decline_reason?: string | null
  amount?: TaxedMoney | null
  unshipped_amount?: TaxedMoney | null
  duration?: number | null
  created_at?: string | null
  debtor?: RawBillieDebtor | null
  invoices?: RawBillieOrderInvoice[] | null
  selected_payment_method?: string | null
  [k: string]: unknown
}

function mapStatus(state: string | null | undefined): ChargeStatus {
  switch (String(state ?? '').toLowerCase()) {
    case 'complete':
    case 'shipped':
      return 'succeeded'
    case 'declined':
      return 'failed'
    case 'cancelled':
    case 'authorization_cancelled':
      return 'cancelled'
    case 'partially_shipped':
    case 'created':
    case 'authorized':
    case 'waiting':
    case 'pre_waiting':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawBillieOrder): Charge {
  const id = String(raw.uuid ?? raw.external_code ?? '')
  const firstInvoice = (raw.invoices ?? []).find((i) => i?.uuid)
  return {
    id,
    externalId: String(raw.external_code ?? raw.uuid ?? ''),
    amount: grossMinor(raw.amount),
    currency: pickCurrency(null),
    status: mapStatus(raw.state),
    customerId: raw.debtor?.external_data?.merchant_customer_id ?? undefined,
    invoiceId: firstInvoice?.uuid ?? undefined,
    failureCode: raw.decline_reason ?? undefined,
    failureMessage: raw.decline_reason ?? undefined,
    gateway: 'billie',
    metadata: strMap({
      state: raw.state,
      debtor_name: raw.debtor?.name,
      duration: raw.duration,
      selected_payment_method: raw.selected_payment_method,
      unshipped_gross: raw.unshipped_amount?.gross,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
