import type { Label, LabelStatus, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface VehoLabel {
  package_id?: string | null
  _id?: string | null
  tracking_number?: string | null
  barcode?: string | null
  /** PDF label hosted URL */
  pdfShippingLabelLink?: string | null
  /** PNG label hosted URL */
  pngShippingLabelLink?: string | null
  /** ZPL label hosted URL */
  zplShippingLabelLink?: string | null
  /** Generic hosted label URL (v2) */
  label_url?: string | null
  currentState?: string | null
  status?: string | null
  serviceClass?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): LabelStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created':   return 'CREATED'
    case 'used':
    case 'delivered': return 'USED'
    case 'voided':
    case 'cancelled':
    case 'canceled':  return 'VOIDED'
    case 'refunded':  return 'REFUNDED'
    default:          return 'UNKNOWN'
  }
}

function pickUrl(raw: VehoLabel): { url: string | undefined; format: LabelFormat | undefined } {
  if (raw.pdfShippingLabelLink) return { url: raw.pdfShippingLabelLink, format: 'PDF' }
  if (raw.pngShippingLabelLink) return { url: raw.pngShippingLabelLink, format: 'PNG' }
  if (raw.zplShippingLabelLink) return { url: raw.zplShippingLabelLink, format: 'ZPL' }
  if (raw.label_url) return { url: raw.label_url, format: 'PDF' }
  return { url: undefined, format: undefined }
}

export function transformLabel(raw: VehoLabel): Label {
  const id = raw.package_id ?? raw._id ?? ''
  const state = raw.currentState ?? raw.status
  const { url, format } = pickUrl(raw)

  return {
    id,
    shipmentId: id,
    trackingNumber: raw.tracking_number ?? raw.barcode ?? undefined,
    carrierId: 'veho',
    serviceCode: raw.serviceClass ?? undefined,
    status: mapStatus(state),
    url: url ?? undefined,
    format: format ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
