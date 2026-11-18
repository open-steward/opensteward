import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface EasyPostPostageLabel {
  id: string
  object: 'PostageLabel'
  created_at: string
  updated_at: string
  label_url: string | null
  label_file_type: string | null   // "application/pdf", "image/png", "application/zpl", "application/epl2"
  label_size: string | null
  label_resolution: number | null
  label_type: string | null
  [key: string]: unknown
}

function mapLabelFormat(fileType: string | null | undefined): LabelFormat | undefined {
  if (!fileType) return undefined
  const t = fileType.toLowerCase()
  if (t.includes('pdf')) return 'PDF'
  if (t.includes('png') || t.includes('image')) return 'PNG'
  if (t.includes('zpl')) return 'ZPL'
  if (t.includes('epl')) return 'EPL2'
  return undefined
}

export function transformLabel(
  raw: EasyPostPostageLabel,
  shipmentId?: string,
  trackingNumber?: string,
  carrier?: string,
  service?: string,
): Label {
  return {
    id: raw.id,
    shipmentId,
    trackingNumber,
    carrierId: carrier,
    serviceCode: service,
    format: mapLabelFormat(raw.label_file_type),
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
