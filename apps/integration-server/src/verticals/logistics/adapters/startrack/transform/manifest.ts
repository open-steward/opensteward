import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ─── StarTrack raw types ─────────────────────────────────────────────────────
// Source: PUT /orders (derived) — Australia Post Shipping and Tracking API.
// In AusPost terminology an "order" IS the manifest: it groups shipments for
// end-of-day lodgement and triggers physical pickup.  The response from
// PUT /orders returns an order/manifest identifier.

export interface StartrackOrderResponse {
  order?: {
    order_id?: string | null
    order_reference?: string | null
    /** ISO 8601 timestamp when the order/manifest was created */
    order_creation_date?: string | null
    /** Link to the manifest PDF */
    summary_url?: string | null
    status?: string | null
    /** Number of labels / articles included */
    label_count?: number | null
    /** Shipment IDs included in this order */
    shipment_ids?: string[] | null
  }
  /** Flat order_id for some response shapes */
  order_id?: string | null
  order_reference?: string | null
  summary_url?: string | null
  status?: string | null
  created_at?: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapManifestStatus(status: string | null | undefined): ManifestStatus {
  if (!status) return 'SUBMITTED'
  const v = status.toUpperCase()
  if (v === 'OPEN' || v === 'PENDING') return 'OPEN'
  if (v === 'CLOSED') return 'CLOSED'
  if (v === 'SUBMITTED' || v === 'CREATED') return 'SUBMITTED'
  if (v === 'ACCEPTED' || v === 'PROCESSED') return 'ACCEPTED'
  return 'SUBMITTED'
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformManifest(raw: StartrackOrderResponse): Manifest {
  // Support both nested `order` envelope and flat shapes
  const inner = raw.order ?? {}
  const orderId = inner.order_id ?? raw.order_id ?? undefined
  const orderRef = inner.order_reference ?? raw.order_reference ?? undefined
  const status = inner.status ?? raw.status ?? undefined
  const summaryUrl = inner.summary_url ?? raw.summary_url ?? undefined
  const labelCount = inner.label_count ?? undefined
  const shipmentIds = inner.shipment_ids ?? undefined
  const createdAt = toISODate(inner.order_creation_date ?? raw.created_at)

  return {
    id: orderId,
    carrierId: 'startrack',
    manifestNumber: orderRef,
    status: mapManifestStatus(status),
    shipmentIds: shipmentIds ?? undefined,
    labelCount: typeof labelCount === 'number' ? labelCount : undefined,
    submittedAt: createdAt,
    createdAt,
    metadata: {
      ...raw,
      summary_url: summaryUrl,
    } as Record<string, unknown>,
  }
}
