import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * Raw label object from the GIG Logistics label endpoint.
 *
 * GIGL generates shipping labels (waybill stickers) on shipment creation.
 * The `labelUrl` field points to a hosted PDF or image of the waybill sticker.
 */
export interface GigLabel {
  id?: string | null
  shipmentId?: string | null
  waybillNumber?: string | null
  labelUrl?: string | null
  /** MIME type or short format string: "pdf", "png", "application/pdf" */
  format?: string | null
  status?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toLowerCase()
  if (f.includes('pdf')) return 'PDF'
  if (f.includes('png') || f.includes('image')) return 'PNG'
  if (f.includes('zpl')) return 'ZPL'
  return undefined
}

function mapLabelStatus(status: string | null | undefined) {
  if (!status) return 'CREATED' as const
  const s = status.toLowerCase()
  if (s === 'voided' || s === 'void') return 'VOIDED' as const
  if (s === 'refunded') return 'REFUNDED' as const
  if (s === 'used') return 'USED' as const
  return 'CREATED' as const
}

export function transformLabel(
  raw: GigLabel,
  shipmentId?: string,
  trackingNumber?: string,
): Label {
  return {
    id: raw.id ?? undefined,
    shipmentId: raw.shipmentId ?? shipmentId,
    trackingNumber: raw.waybillNumber ?? trackingNumber,
    carrierId: 'gig-logistics',
    format: mapLabelFormat(raw.format),
    status: mapLabelStatus(raw.status),
    url: raw.labelUrl ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
