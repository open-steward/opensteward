import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// Korea Post does not expose a dedicated /labels endpoint.
// Labels are embedded in the shipment response (label_url field).
// Derived: a Label record is constructed from the Korea Post shipment response.

export interface KoreaPostLabelRaw {
  id?: string | null
  shipment_id?: string | null
  tracking_number?: string | null
  service_code?: string | null
  label_url?: string | null
  label_format?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapLabelFormat(fmt: string | null | undefined): 'PDF' | 'PNG' | 'ZPL' | 'EPL2' | undefined {
  if (!fmt) return undefined
  const f = fmt.toUpperCase()
  if (f === 'PDF') return 'PDF'
  if (f === 'PNG') return 'PNG'
  if (f === 'ZPL') return 'ZPL'
  if (f === 'EPL2') return 'EPL2'
  return undefined
}

export function transformLabel(raw: KoreaPostLabelRaw): Label {
  return {
    id: raw.id ?? raw.shipment_id ?? undefined,
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'korea-post',
    serviceCode: raw.service_code ?? undefined,
    format: mapLabelFormat(raw.label_format),
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
