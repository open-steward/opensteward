import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * Quiqup label — embedded on a delivery job after it has been accepted/confirmed.
 */
export interface QuiqupLabel {
  id?: string | null
  url?: string | null
  format?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapLabelFormat(format: string | null | undefined): Label['format'] {
  if (!format) return undefined
  const f = format.toLowerCase()
  if (f.includes('pdf')) return 'PDF'
  if (f.includes('png') || f.includes('image')) return 'PNG'
  if (f.includes('zpl')) return 'ZPL'
  if (f.includes('epl')) return 'EPL2'
  return undefined
}

function mapLabelStatus(status: string | null | undefined): Label['status'] {
  switch (status) {
    case 'created':
    case 'active':
      return 'CREATED'
    case 'used':
    case 'scanned':
      return 'USED'
    case 'refunded':
      return 'REFUNDED'
    case 'voided':
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'CREATED'
  }
}

export function transformLabel(
  raw: QuiqupLabel,
  shipmentId?: string,
  trackingNumber?: string,
): Label {
  return {
    id: raw.id ?? undefined,
    shipmentId,
    trackingNumber,
    carrierId: 'quiqup',
    format: mapLabelFormat(raw.format),
    status: mapLabelStatus(raw.status),
    url: raw.url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
