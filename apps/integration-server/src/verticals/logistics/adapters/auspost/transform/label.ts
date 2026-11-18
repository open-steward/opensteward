import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface AusPostLabelResponse {
  shipment_id: string
  tracking_id?: string
  service_code?: string
  label_data?: string
  label_format?: string
  [key: string]: unknown
}

export interface AusPostLabelsResponse {
  labels: AusPostLabelResponse[]
  [key: string]: unknown
}

function mapLabelFormat(format: string | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toUpperCase()
  if (f === 'PDF') return 'PDF'
  if (f === 'PNG') return 'PNG'
  if (f === 'ZPL') return 'ZPL'
  return undefined
}

export function transformLabel(raw: AusPostLabelResponse): Label {
  return {
    id: raw.shipment_id,
    shipmentId: raw.shipment_id,
    trackingNumber: raw.tracking_id ?? undefined,
    carrierId: 'auspost',
    serviceCode: raw.service_code ?? undefined,
    format: mapLabelFormat(raw.label_format ?? 'PDF'),
    status: 'CREATED',
    base64: raw.label_data ?? undefined,
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
