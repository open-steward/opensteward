import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { ShippyProShipment } from './shipment'

function mapLabelFormat(fmt: string | null | undefined): LabelFormat | undefined {
  if (!fmt) return undefined
  const f = fmt.toLowerCase()
  if (f.includes('pdf')) return 'PDF'
  if (f.includes('png') || f.includes('image')) return 'PNG'
  if (f.includes('zpl')) return 'ZPL'
  if (f.includes('epl')) return 'EPL2'
  return undefined
}

export function transformLabel(raw: ShippyProShipment): Label {
  return {
    id: raw.TransactionId ?? raw.OrderId ?? undefined,
    shipmentId: raw.OrderId ?? raw.TransactionId ?? undefined,
    trackingNumber: raw.TrackingNumber ?? undefined,
    carrierId: raw.CarrierName ?? undefined,
    serviceCode: raw.ServiceName ?? undefined,
    format: mapLabelFormat(raw.LabelFormat),
    status: 'CREATED',
    url: raw.LabelUrl ?? undefined,
    createdAt: toISODate(raw.CreatedAt ?? raw.ShipDate),
    updatedAt: toISODate(raw.UpdatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * `GetLabelUrl` response (https://api.shippypro.com/docs/v1.json,
 * `GetLabelUrlResponse`): "LabelURL": "Label URL. An empty array (`[]`) when
 * the order is in error, a single string when the order has one label, or an
 * array of strings when it has more than one label."; "PDF": "List of
 * base64-encoded PDF labels."; "TrackingCarrier"; "TrackingNumber".
 */
export interface ShippyProLabelUrl {
  LabelURL?: string | string[] | null
  PDF?: string[] | null
  ZPL?: string[] | null
  TrackingCarrier?: string | null
  TrackingNumber?: string | null
  [key: string]: unknown
}

/** The label URLs of a `GetLabelUrl` response, as a list. */
export function labelUrls(raw: ShippyProLabelUrl): string[] {
  const v = raw.LabelURL
  if (typeof v === 'string') return v ? [v] : []
  return (v ?? []).filter((u) => typeof u === 'string' && u !== '')
}

/**
 * The order's (first) label. `id` and `shipmentId` are the ShippyPro
 * `OrderID` it was asked for; the response does not echo it. `format` is set
 * only for the documented base64 `PDF` body; a URL's format is not stated.
 * An order with more than one label keeps the rest in `metadata`.
 */
export function transformLabelUrl(orderId: string, raw: ShippyProLabelUrl): Label {
  const url = labelUrls(raw).find((u) => /^https?:\/\//i.test(u))
  const pdf = raw.PDF?.find((b) => typeof b === 'string' && b !== '')
  return {
    id: orderId,
    shipmentId: orderId,
    trackingNumber: raw.TrackingNumber || undefined,
    format: pdf ? 'PDF' : undefined,
    url,
    base64: pdf,
    metadata: raw as Record<string, unknown>,
  }
}
