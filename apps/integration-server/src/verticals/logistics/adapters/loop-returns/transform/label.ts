import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Raw API types ────────────────────────────────────────────────────────────

interface LoopLabelRequestAddress {
  name?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
  country_code?: string | null
  [key: string]: unknown
}

interface LoopLabelRequestAddresses {
  origin?: LoopLabelRequestAddress | null
  destination?: LoopLabelRequestAddress | null
  [key: string]: unknown
}

interface LoopLabelRequestParcel {
  height?: number | null
  length?: number | null
  width?: number | null
  weight?: number | null
  [key: string]: unknown
}

export interface LoopLabelRequest {
  id?: string | number | null
  return_id?: string | number | null
  shop_id?: string | number | null
  /**
   * Status values: "issued" | "cancelled" | "fulfilled"
   */
  status?: string | null
  created_at?: string | null
  addresses?: LoopLabelRequestAddresses | null
  parcel?: LoopLabelRequestParcel | null
  products?: unknown[] | null
  errors?: unknown[] | null
  [key: string]: unknown
}

export interface LoopLabelRequestsResponse {
  data?: LoopLabelRequest[] | null
  [key: string]: unknown
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapLabelStatus(status: string | null | undefined): LabelStatus {
  switch (status) {
    case 'issued':    return 'CREATED'
    case 'fulfilled': return 'USED'
    case 'cancelled': return 'VOIDED'
    default:          return 'UNKNOWN'
  }
}

// ─── Transform ───────────────────────────────────────────────────────────────

/**
 * Transform a Loop Returns label request into a canonical Label.
 * Loop Returns uses a third-party label request model — the label request
 * represents a request to generate a return shipping label.
 * Real endpoint: GET /label-requests  (OAuth2, "Label Requests (Read)" scope)
 */
export function transformLabelRequestToLabel(raw: LoopLabelRequest): Label {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    shipmentId: raw.return_id != null ? String(raw.return_id) : undefined,
    status: mapLabelStatus(raw.status),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
