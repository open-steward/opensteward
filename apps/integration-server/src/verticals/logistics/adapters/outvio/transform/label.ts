import type { Label, LabelFormat } from '../../../schema/label'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * Raw Outvio label object as returned by GET /v1/shipments/:id/label or
 * POST /v1/labels.
 */
export interface OutvioLabel {
  id?: string | null
  shipmentId?: string | null
  shipment_id?: string | null
  trackingNumber?: string | null
  tracking_number?: string | null
  carrierId?: string | null
  carrier_id?: string | null
  serviceCode?: string | null
  service_code?: string | null
  /** MIME type or extension: "pdf", "png", "zpl", "application/pdf", etc. */
  format?: string | null
  fileType?: string | null
  file_type?: string | null
  status?: string | null
  url?: string | null
  labelUrl?: string | null
  label_url?: string | null
  /** Base64-encoded label content when not hosted as a URL. */
  base64?: string | null
  cost?: number | null
  currency?: string | null
  refundAt?: string | null
  refund_at?: string | null
  voidedAt?: string | null
  voided_at?: string | null
  createdAt?: string | null
  created_at?: string | null
  updatedAt?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toLowerCase()
  if (f.includes('pdf')) return 'PDF'
  if (f.includes('png') || f.includes('image')) return 'PNG'
  if (f.includes('zpl')) return 'ZPL'
  if (f.includes('epl')) return 'EPL2'
  return undefined
}

function mapLabelStatus(
  status: string | null | undefined,
): 'CREATED' | 'USED' | 'REFUNDED' | 'VOIDED' | undefined {
  switch ((status ?? '').toLowerCase()) {
    case 'created':
    case 'active':
      return 'CREATED'
    case 'used':
    case 'printed':
      return 'USED'
    case 'refunded':
      return 'REFUNDED'
    case 'voided':
    case 'cancelled':
    case 'canceled':
      return 'VOIDED'
    default:
      return 'CREATED'
  }
}

export function transformLabel(raw: OutvioLabel): Label {
  const cost = parseDecimal(raw.cost)
  const currency = raw.currency ?? 'EUR'
  const fmt = raw.format ?? raw.fileType ?? raw.file_type
  const url = raw.url ?? raw.labelUrl ?? raw.label_url ?? undefined

  return {
    id: raw.id ?? undefined,
    shipmentId: raw.shipmentId ?? raw.shipment_id ?? undefined,
    trackingNumber: raw.trackingNumber ?? raw.tracking_number ?? undefined,
    carrierId: raw.carrierId ?? raw.carrier_id ?? undefined,
    serviceCode: raw.serviceCode ?? raw.service_code ?? undefined,
    format: mapLabelFormat(fmt),
    status: mapLabelStatus(raw.status),
    url,
    base64: raw.base64 ?? undefined,
    cost: cost !== undefined ? { amount: cost, currency } : undefined,
    refundAt: toISODate(raw.refundAt ?? raw.refund_at),
    voidedAt: toISODate(raw.voidedAt ?? raw.voided_at),
    createdAt: toISODate(raw.createdAt ?? raw.created_at),
    updatedAt: toISODate(raw.updatedAt ?? raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
