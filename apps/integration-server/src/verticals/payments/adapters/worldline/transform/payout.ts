import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, worldlineDateTime } from './shared'

/**
 * Worldline Direct "Payout" object. Money lives under
 * `payoutOutput.amountOfMoney`; references under `payoutOutput.references`;
 * lifecycle under `status` / `statusOutput`.
 *
 * Docs: https://apireference.connect.worldline-solutions.com/s2sapi/v1/en_US/go/payouts/get.html
 * Get:  GET /v2/{merchantId}/payouts/{payoutId}
 */
export interface RawWorldlinePayoutOutput {
  amountOfMoney?: {
    amount?: number
    currencyCode?: string
  }
  references?: {
    merchantOrderId?: number
    merchantReference?: string
    paymentReference?: string
    providerId?: string
    providerMerchantId?: string
    providerReference?: string
    referenceOrigPayment?: string
  }
}

export interface RawWorldlinePayoutStatusOutput {
  statusCode?: number
  statusCategory?: string
  isCancellable?: boolean
  isRetriable?: boolean
  statusCodeChangeDateTime?: string
}

export interface RawWorldlinePayout {
  id?: string
  status?: string
  payoutOutput?: RawWorldlinePayoutOutput
  statusOutput?: RawWorldlinePayoutStatusOutput
  [k: string]: unknown
}

function mapPayoutStatus(status: string | undefined): PayoutStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'ACCOUNT_CREDITED':
      return 'paid'
    case 'PAYOUT_REQUESTED':
    case 'CREATED':
    case 'PENDING_APPROVAL':
      return 'pending'
    case 'REJECTED':
    case 'REJECTED_CREDIT':
      return 'failed'
    case 'CANCELLED':
    case 'REVERSED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawWorldlinePayout): Payout {
  const out = raw.payoutOutput ?? {}
  const money = out.amountOfMoney ?? {}
  const refs = out.references ?? {}
  const so = raw.statusOutput ?? {}
  const changedAt = toIsoDatetime(worldlineDateTime(so.statusCodeChangeDateTime))

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: money.amount ?? 0,
    currency: pickCurrency(money.currencyCode),
    status: mapPayoutStatus(raw.status),
    gateway: 'worldline',
    metadata: strMap({
      merchantReference: refs.merchantReference,
      merchantOrderId: refs.merchantOrderId,
      paymentReference: refs.paymentReference,
      providerReference: refs.providerReference,
      statusCode: so.statusCode,
      statusCategory: so.statusCategory,
      worldlineStatus: raw.status,
    }),
    createdAt: changedAt,
    updatedAt: changedAt,
    raw,
  }
}
