import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * A shipping label returned embedded in a task or from a dedicated label
 * endpoint on the Shippify API.
 */
export interface ShippifyLabel {
  id?: string | null
  task_id?: string | null
  tracking_id?: string | null
  carrier_id?: string | null
  service_type?: string | null
  format?: string | null           // 'pdf', 'png', 'zpl'
  status?: string | null           // 'created', 'used', 'voided'
  url?: string | null
  base64?: string | null
  created_at?: string | null
  updated_at?: string | null
  voided_at?: string | null
  [key: string]: unknown
}

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  switch ((format ?? '').toLowerCase()) {
    case 'pdf':  return 'PDF'
    case 'png':  return 'PNG'
    case 'zpl':  return 'ZPL'
    case 'epl2': return 'EPL2'
    default:     return undefined
  }
}

function mapLabelStatus(status: string | null | undefined) {
  switch ((status ?? '').toLowerCase()) {
    case 'created': return 'CREATED' as const
    case 'used':    return 'USED' as const
    case 'voided':  return 'VOIDED' as const
    default:        return 'CREATED' as const
  }
}

export function transformLabel(raw: ShippifyLabel): Label {
  return {
    id: raw.id ?? undefined,
    shipmentId: raw.task_id ?? undefined,
    trackingNumber: raw.tracking_id ?? undefined,
    carrierId: raw.carrier_id ?? undefined,
    serviceCode: raw.service_type ?? undefined,
    format: mapLabelFormat(raw.format),
    status: mapLabelStatus(raw.status),
    url: raw.url ?? undefined,
    base64: raw.base64 ?? undefined,
    voidedAt: toISODate(raw.voided_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
