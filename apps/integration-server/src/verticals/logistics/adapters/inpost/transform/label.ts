import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface InPostLabelResponse {
  shipmentId: string
  trackingNumber?: string
  serviceCode?: string
  format?: string
  labelData?: string
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

export function transformLabel(raw: InPostLabelResponse): Label {
  return {
    id: raw.shipmentId,
    shipmentId: raw.shipmentId,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'inpost',
    serviceCode: raw.serviceCode ?? undefined,
    format: mapLabelFormat(raw.format ?? 'PDF'),
    status: 'CREATED',
    base64: raw.labelData ?? undefined,
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
