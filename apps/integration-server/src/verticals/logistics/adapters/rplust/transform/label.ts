import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── R+L Carriers raw label types ─────────────────────────────────────────────
// Source: GET /BillOfLading/PrintShippingLabels?ProNumber={proNumber}
// Returns a base64-encoded PDF of shipping labels for a given PRO number.

export interface RplusLLabelResponse {
  ProNumber?: string | null
  Label?: string | null        // base64-encoded PDF content
  LabelPDF?: string | null     // alternate field name seen in some versions
  Code?: number | null
  Errors?: unknown[] | null
  CreatedDate?: string | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformLabel(raw: RplusLLabelResponse): Label {
  const base64Content = raw.Label ?? raw.LabelPDF ?? undefined

  return {
    id: raw.ProNumber ?? undefined,
    trackingNumber: raw.ProNumber ?? undefined,
    carrierId: 'rplust',
    format: 'PDF',
    status: base64Content ? 'CREATED' : undefined,
    base64: base64Content ?? undefined,
    createdAt: toISODate(raw.CreatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
