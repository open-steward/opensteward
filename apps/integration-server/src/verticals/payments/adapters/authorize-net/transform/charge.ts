import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, strMap } from './shared'

export interface RawAuthNetTransaction {
  transId?: string
  status?: string
  transactionStatus?: string
  transactionType?: string
  authAmount?: string
  settleAmount?: string
  refundedAmount?: string
  responseCode?: string
  invoiceNumber?: string
  customer?: { email?: string; id?: string }
  billTo?: { firstName?: string; lastName?: string }
  submitTimeUTC?: string
  [k: string]: unknown
}

function mapStatus(raw: RawAuthNetTransaction): ChargeStatus {
  const s = (raw.status ?? raw.transactionStatus ?? '').toLowerCase()
  if (s.includes('capturedpendingsettlement') || s.includes('authorizedpendingcapture')) return 'pending'
  if (s.includes('settled')) return 'succeeded'
  if (s.includes('voided')) return 'cancelled'
  if (s.includes('refundsettled') || s.includes('refundpending')) return 'refunded'
  if (s.includes('declined') || s.includes('error') || s.includes('failed')) return 'failed'
  return 'pending'
}

export function transformCharge(raw: RawAuthNetTransaction): Charge {
  const name = [raw.billTo?.firstName, raw.billTo?.lastName].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.transId ?? ''),
    externalId: String(raw.transId ?? ''),
    amount: decimalToMinor(raw.settleAmount ?? raw.authAmount),
    // Authorize.Net's merchant account is single-currency; the JSON response
    // doesn't echo it. Default USD; consumers reading multi-currency setups
    // should pull the merchant-account currency from billing context.
    currency: 'USD',
    amountRefunded: decimalToMinor(raw.refundedAmount),
    status: mapStatus(raw),
    customerId: raw.customer?.id,
    receiptEmail: raw.customer?.email,
    description: name || raw.invoiceNumber,
    failureCode: raw.responseCode,
    gateway: 'authorize-net',
    metadata: strMap({
      invoice_number: raw.invoiceNumber,
      transaction_type: raw.transactionType,
    }),
    createdAt: raw.submitTimeUTC,
    raw,
  }
}
