/**
 * Gophr V2 Commercial API — Job → canonical Order.
 *
 * A Gophr job "contains many deliveries, each delivery consists of a pickup,
 * dropoff and many parcels" (API description in the OpenAPI below), which is
 * the closest thing Gophr has to an order.
 *
 * List:  GET /jobs            → { data: { jobs: Job[] }, links, meta }
 * Get:   GET /jobs/{job_id}   → { data: Job }
 *
 * Job = `Response-Create-Multidrop-Job` in the OpenAPI embedded in
 * https://developers.gophr.com/reference/get-job.md: `job_id` (required),
 * `is_confirmed`, `vehicle_type`, `price_net` / `price_gross` (each a
 * `Field-Collection-Money` `{ amount: number, currency: string }`),
 * `job_priority`, `distance` and `deliveries[]` (`delivery_id`, `status`,
 * `leg_type`, `private_job_url`, `public_tracker_url`, sequence numbers,
 * `parcels`).
 *
 * The job carries no status of its own (status is per delivery), no addresses
 * and no timestamps, so none of those are mapped.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Order } from '../../../schema/order'

// ─── Gophr raw types ────────────────────────────────────────────────────────

/** Field-Collection-Money. */
export interface GophrMoney {
  amount?: number | null
  currency?: string | null
}

/** Response-Deliveries. */
export interface GophrDelivery {
  delivery_id: string
  status?: string | null
  leg_type?: string | null
  private_job_url?: string | null
  public_tracker_url?: string | null
  pickup_sequence_number?: number | null
  dropoff_sequence_number?: number | null
  parcels?: Array<Record<string, unknown>> | null
}

/** Response-Create-Multidrop-Job. */
export interface GophrJob {
  job_id: string
  is_confirmed?: number | null
  vehicle_type?: number | null
  job_priority?: number | null
  distance?: number | null
  price_net?: GophrMoney | null
  price_gross?: GophrMoney | null
  deliveries?: GophrDelivery[] | null
  [key: string]: unknown
}

/** List Jobs response envelope. */
export interface GophrJobListResponse {
  data?: { jobs?: GophrJob[] | null } | null
  /** Field-Collection-Pagination-Links: `next` is "`null` if on the last page." */
  links?: { first?: string | null; previous?: string | null; next?: string | null } | null
  /** `meta.page` = Field-Collection-Pagination-Meta. */
  meta?: { page?: { current_page?: number; count?: number; total?: number } | null } | null
}

/** Get a Job response envelope. */
export interface GophrJobResponse {
  data?: GophrJob | null
}

// ─── Transform ──────────────────────────────────────────────────────────────

const ISO_4217 = /^[A-Z]{3}$/

/**
 * Gross price as integer minor units, only when both amount and currency are
 * present. A negative amount is dropped: the docs give no sign for
 * Field-Collection-Money, but OrderSchema.totalAmount is `min(0)`.
 */
function grossPrice(raw: GophrJob): { totalAmount: number; currency: string } | undefined {
  const money = raw.price_gross
  if (!money || typeof money !== 'object') return undefined
  const { amount, currency } = money
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return undefined
  if (typeof currency !== 'string' || !ISO_4217.test(currency)) return undefined
  return { totalAmount: majorToMinor(amount, currency), currency }
}

export function transformOrder(raw: GophrJob): Order {
  if (typeof raw.job_id !== 'string' || raw.job_id.length === 0) {
    throw new Error('Gophr job has no job_id')
  }
  const deliveryIds = (raw.deliveries ?? [])
    .map((d) => d.delivery_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const price = grossPrice(raw)

  return {
    id: raw.job_id,
    shipmentIds: deliveryIds.length > 0 ? deliveryIds : undefined,
    ...(price ?? {}),
    metadata: raw as Record<string, unknown>,
  }
}
