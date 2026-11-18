import type { Label, LabelFormat, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * A single item from the DHL Parcel DE POST /orders or GET /orders response.
 * https://developer.dhl.com/api-reference/parcel-de-shipping-post-parcel-germany-v2
 */
export interface DhlParcelDeDocument {
  b64?: string | null
  zpl2?: string | null
  url?: string | null
  fileFormat?: string | null
  printFormat?: string | null
  [key: string]: unknown
}

export interface DhlParcelDeOrderItem {
  shipmentNo?: string | null
  shipmentRefNo?: string | null
  routingCode?: string | null
  returnShipmentNo?: string | null
  label?: DhlParcelDeDocument | null
  returnLabel?: DhlParcelDeDocument | null
  customsDoc?: DhlParcelDeDocument | null
  codLabel?: DhlParcelDeDocument | null
  sstatus?: Record<string, unknown> | null
  validationMessages?: unknown[]
  [key: string]: unknown
}

export interface DhlParcelDeLabelDataResponse {
  status?: Record<string, unknown> | null
  items?: DhlParcelDeOrderItem[]
  [key: string]: unknown
}

function mapLabelFormat(fileFormat: string | null | undefined): LabelFormat {
  const fmt = (fileFormat ?? '').toUpperCase()
  if (fmt === 'ZPL2') return 'ZPL'
  if (fmt === 'PDF') return 'PDF'
  return 'UNKNOWN'
}

function mapLabelStatus(_raw: DhlParcelDeOrderItem): LabelStatus {
  // DHL /orders returns freshly created labels; there is no void/refund status
  // in the response — treat all items as CREATED
  return 'CREATED'
}

export function transformLabel(raw: DhlParcelDeOrderItem): Label {
  const doc = raw.label ?? null
  const fmt = mapLabelFormat(doc?.fileFormat)

  return {
    id: raw.shipmentNo ?? undefined,
    shipmentId: raw.shipmentNo ?? undefined,
    trackingNumber: raw.shipmentNo ?? undefined,
    carrierId: 'dhl-parcel-de',
    format: fmt,
    status: mapLabelStatus(raw),
    url: doc?.url ?? undefined,
    base64: doc?.b64 ?? undefined,
    createdAt: toISODate(undefined),   // /orders response does not carry a timestamp
    metadata: raw as Record<string, unknown>,
  }
}

export function transformLabelResponse(raw: DhlParcelDeLabelDataResponse): Label[] {
  const items = raw.items ?? []
  return items
    .filter((item) => item.shipmentNo != null)
    .map((item) => transformLabel(item))
}
