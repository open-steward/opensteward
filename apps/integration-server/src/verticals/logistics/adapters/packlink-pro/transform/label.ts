import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface PacklinkProLabel {
  id: string
  shipment_id?: string | null
  tracking_number?: string | null
  service_code?: string | null
  format?: string | null
  url?: string | null
  base64?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapFormat(fmt: string | null | undefined): LabelFormat | undefined {
  if (!fmt) return undefined
  const t = fmt.toUpperCase()
  if (t.includes('PDF')) return 'PDF'
  if (t.includes('PNG') || t.includes('IMAGE')) return 'PNG'
  if (t.includes('ZPL')) return 'ZPL'
  if (t.includes('EPL')) return 'EPL2'
  return undefined
}

export function transformLabel(raw: PacklinkProLabel): Label {
  return {
    id: raw.id,
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'packlink-pro',
    serviceCode: raw.service_code ?? undefined,
    format: mapFormat(raw.format),
    status: 'CREATED',
    url: raw.url ?? undefined,
    base64: raw.base64 ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
