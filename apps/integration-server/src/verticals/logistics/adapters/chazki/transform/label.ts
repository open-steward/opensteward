import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * Chazki label object — returned as part of a shipment or via POST /labels.
 */
export interface ChazkiLabel {
  id?: string | null
  shipment_id?: string | null
  tracking_number?: string | null
  tracking_code?: string | null
  carrier?: string | null
  service?: string | null
  /** Direct URL to the label file. */
  url?: string | null
  label_url?: string | null
  /** Base64-encoded label content (ZPL or PDF). */
  content?: string | null
  base64?: string | null
  /** MIME type or format hint: "application/pdf", "application/zpl", "image/png". */
  format?: string | null
  file_type?: string | null
  status?: string | null
  amount?: number | null
  currency?: string | null
  voided_at?: string | null
  refund_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  const f = (format ?? '').toLowerCase()
  if (f.includes('pdf')) return 'PDF'
  if (f.includes('png') || f.includes('image')) return 'PNG'
  if (f.includes('zpl')) return 'ZPL'
  if (f.includes('epl')) return 'EPL2'
  return undefined
}

function mapLabelStatus(status: string | null | undefined) {
  switch ((status ?? '').toLowerCase()) {
    case 'created':
    case 'creado':
      return 'CREATED'
    case 'used':
    case 'usado':
      return 'USED'
    case 'refunded':
    case 'reembolsado':
      return 'REFUNDED'
    case 'voided':
    case 'anulado':
      return 'VOIDED'
    default:
      return 'CREATED'
  }
}

export function transformLabel(raw: ChazkiLabel): Label {
  return {
    id: raw.id ?? undefined,
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? raw.tracking_code ?? undefined,
    carrierId: raw.carrier ?? 'chazki',
    serviceCode: raw.service ?? undefined,
    format: mapLabelFormat(raw.format ?? raw.file_type),
    status: mapLabelStatus(raw.status),
    url: raw.url ?? raw.label_url ?? undefined,
    base64: raw.content ?? raw.base64 ?? undefined,
    cost: raw.amount != null
      ? { amount: Number(raw.amount), currency: raw.currency ?? 'PEN' }
      : undefined,
    voidedAt: toISODate(raw.voided_at),
    refundAt: toISODate(raw.refund_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
