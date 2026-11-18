/**
 * Payrexx Transaction -> canonical Charge.
 *
 * Fields are the documented "Retrieve Transactions" / "Retrieve a Transaction"
 * response (https://developers.payrexx.com/reference/retrieve-transactions.md):
 * integer `id` (the `{id}` of GET /Transaction/{id}/), `status`,
 * `invoice.currencyAlpha3`, `invoice.totalAmount`, `referenceId` and
 * `contact.id`. Amounts are already minor units: "All amounts are in the
 * smallest unit of the currency. (e.g. 2 JPY => 2, 2 EUR => 200)"
 * (https://developers.payrexx.com/docs/webhooks.md).
 *
 * `time` ("2020-01-20 15:56:02") carries no documented time zone, so it is
 * left in `raw` rather than guessed into createdAt.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'

export interface RawPayrexxTransaction {
  id?: number | string
  status?: string
  referenceId?: string | null
  invoice?: { currencyAlpha3?: string; totalAmount?: number; [k: string]: unknown } | null
  contact?: { id?: number | string; [k: string]: unknown } | null
  [k: string]: unknown
}

/**
 * Status values are the Transaction response model's constants in Payrexx's
 * PHP SDK (lib/Payrexx/Models/Response/Transaction.php) plus "chargeback",
 * which the webhook docs list ("Chargeback by card holder (status: chargeback)").
 */
function mapStatus(s: unknown): ChargeStatus {
  switch (s) {
    // refund_pending: "the refund has been initialized but not yet confirmed
    // by the bank" (webhooks docs), so the payment itself went through.
    case 'confirmed':
    case 'refund_pending':
      return 'succeeded'
    case 'initiated':
    case 'waiting':
    case 'authorized':
    case 'reserved':
    case 'uncaptured':
      return 'pending'
    case 'cancelled':
    case 'expired':
      return 'cancelled'
    case 'declined':
    case 'error':
    case 'insecure':
      return 'failed'
    case 'refunded':
      return 'refunded'
    case 'partially-refunded':
      return 'partially_refunded'
    case 'disputed':
    case 'chargeback':
      return 'disputed'
    default:
      return 'unknown'
  }
}

export function transformCharge(raw: RawPayrexxTransaction): Charge {
  const id = raw.id
  if (typeof id !== 'number' && (typeof id !== 'string' || id === '')) {
    throw new Error('Payrexx transaction has no id')
  }
  const amount = raw.invoice?.totalAmount
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    throw new Error(`Payrexx transaction ${id} has no invoice.totalAmount`)
  }
  const currency = raw.invoice?.currencyAlpha3
  if (typeof currency !== 'string' || currency === '') {
    throw new Error(`Payrexx transaction ${id} has no invoice.currencyAlpha3`)
  }
  const contactId = raw.contact?.id
  const metadata: Record<string, string> = {}
  if (typeof raw.referenceId === 'string' && raw.referenceId !== '')
    metadata['referenceId'] = raw.referenceId

  return {
    id: String(id),
    externalId: String(id),
    amount,
    currency: currency.toUpperCase(),
    status: mapStatus(raw.status),
    customerId: contactId != null && contactId !== '' ? String(contactId) : undefined,
    gateway: 'payrexx',
    metadata,
    raw,
  }
}
