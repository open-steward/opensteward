import { toIsoDatetime } from '@opensteward/shared'
import type { Dispute, DisputeStatus } from '../../../schema/dispute'
import { pickCurrency, strMap, worldlineDateTime } from './shared'

/**
 * Worldline Direct "Dispute" object. Disputes are attached to a payment and
 * retrieved via `GET /v2/{merchantId}/payments/{paymentId}/disputes` (list) or
 * `GET /v2/{merchantId}/disputes/{disputeId}` (individual).
 *
 * Docs: https://apireference.connect.worldline-solutions.com/s2sapi/v1/en_US/java/disputes/get.html
 * List: GET /v2/{merchantId}/payments/{paymentId}/disputes
 * Get:  GET /v2/{merchantId}/disputes/{disputeId}
 */
export interface RawWorldlineDisputeOutput {
  amountOfMoney?: {
    amount?: number
    currencyCode?: string
  }
  contactPerson?: string
  emailAddress?: string
  replyTo?: string
  requestMessage?: string
  responseMessage?: string
  creationDetails?: {
    disputeCreationDate?: string
    disputeOriginator?: string
    userName?: string
  }
  reference?: {
    merchantOrderId?: number
    merchantReference?: string
    paymentReference?: string
  }
}

export interface RawWorldlineDisputeStatusOutput {
  statusCode?: number
  statusCategory?: string
  isCancellable?: boolean
  statusCodeChangeDateTime?: string
}

export interface RawWorldlineDispute {
  id?: string
  paymentId?: string
  captureId?: string
  status?: string
  disputeOutput?: RawWorldlineDisputeOutput
  statusOutput?: RawWorldlineDisputeStatusOutput
  [k: string]: unknown
}

export interface RawWorldlineDisputeListResponse {
  disputes?: RawWorldlineDispute[]
}

function mapDisputeStatus(status: string | undefined): DisputeStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'CREATED':
    case 'DRAFT':
      return 'needs_response'
    case 'IN_REVIEW':
    case 'SUBMITTED':
      return 'under_review'
    case 'WON':
      return 'won'
    case 'LOST':
      return 'lost'
    case 'CANCELLED':
    case 'REVERSED':
      return 'warning_closed'
    default:
      return 'needs_response'
  }
}

export function transformDispute(raw: RawWorldlineDispute): Dispute {
  const out = raw.disputeOutput ?? {}
  const money = out.amountOfMoney ?? {}
  const refs = out.reference ?? {}
  const so = raw.statusOutput ?? {}
  const changedAt = toIsoDatetime(worldlineDateTime(so.statusCodeChangeDateTime))
  const createdAt = toIsoDatetime(worldlineDateTime(out.creationDetails?.disputeCreationDate))

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.paymentId ?? ''),
    amount: money.amount ?? 0,
    currency: pickCurrency(money.currencyCode),
    status: mapDisputeStatus(raw.status),
    gateway: 'worldline',
    metadata: strMap({
      captureId: raw.captureId,
      merchantReference: refs.merchantReference,
      paymentReference: refs.paymentReference,
      contactPerson: out.contactPerson,
      responseMessage: out.responseMessage,
      statusCode: so.statusCode,
      statusCategory: so.statusCategory,
      worldlineStatus: raw.status,
    }),
    createdAt: createdAt ?? changedAt,
    updatedAt: changedAt,
    raw,
  }
}
