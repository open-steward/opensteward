import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Hermes Germany raw types ─────────────────────────────────────────────────
// Labels are derived from the shipment object — Hermes DE does not expose a
// dedicated /labels endpoint. The label URL and tracking number are embedded
// in the shipment response.

export interface HermesDeShipmentForLabel {
  id: string
  tracking_number?: string | null
  status?: string | null
  service_code?: string | null
  label_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: HermesDeShipmentForLabel): Label {
  return {
    id: raw.id,
    shipmentId: raw.id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'hermes-de',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: raw.label_url != null ? 'CREATED' : undefined,
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
