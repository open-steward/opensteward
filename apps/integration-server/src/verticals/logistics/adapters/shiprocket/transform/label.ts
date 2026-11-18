import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// Shiprocket POST courier/generate/label
// Request: { shipment_id: number[] }
// Response: { label_url: string | null, is_return: boolean, shipment_id: number, ... }

export interface ShiprocketLabelResponse {
  label_url: string | null
  is_return: boolean | null
  shipment_id: number | null
  not_created: unknown[] | null
  [key: string]: unknown
}

export function transformLabel(raw: ShiprocketLabelResponse): Label {
  return {
    id: raw.shipment_id != null ? String(raw.shipment_id) : undefined,
    shipmentId: raw.shipment_id != null ? String(raw.shipment_id) : undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate((raw as Record<string, unknown>).created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
