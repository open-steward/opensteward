import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * ShippingLabel as returned nested inside shipment.shipping_labels[] in ShipHero's GraphQL API.
 * Source: https://developer.shiphero.com/schema/queries/shipment.html
 *
 * Labels in ShipHero are not independently queryable — they are always retrieved
 * as a nested array within a shipment or shipments query.
 */
export interface ShipheroLabelNested {
  id?: string | null
  legacy_id?: number | null
  shipment_id?: string | null
  order_id?: string | null
  tracking_number?: string | null
  alternate_tracking_id?: string | null
  carrier?: string | null
  shipping_name?: string | null
  shipping_method?: string | null
  cost?: number | string | null
  status?: string | null
  refunded?: boolean | null
  needs_refund?: boolean | null
  tracking_url?: string | null
  label?: {
    pdf_location?: string | null
    paper_pdf_location?: string | null
    thermal_pdf_location?: string | null
    image_location?: string | null
  } | null
  created_date?: string | null
  [key: string]: unknown
}

function mapLabelStatus(raw: string | null | undefined): LabelStatus {
  if (!raw) return 'CREATED'
  if (raw === 'refunded' || raw === 'needs_refund') return 'REFUNDED'
  if (raw === 'voided' || raw === 'cancelled') return 'VOIDED'
  if (raw === 'used' || raw === 'completed') return 'USED'
  return 'CREATED'
}

export function transformLabel(raw: ShipheroLabelNested, shipmentId?: string): Label {
  const url =
    raw.label?.pdf_location ??
    raw.label?.paper_pdf_location ??
    raw.label?.thermal_pdf_location ??
    raw.tracking_url ??
    undefined

  const costVal =
    raw.cost !== null && raw.cost !== undefined ? Number(raw.cost) : undefined

  return {
    id: raw.id ?? undefined,
    shipmentId: raw.shipment_id ?? shipmentId ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.shipping_method ?? undefined,
    status: mapLabelStatus(raw.status ?? (raw.refunded ? 'refunded' : undefined)),
    url: url as string | undefined,
    cost:
      costVal !== undefined
        ? { amount: costVal, currency: 'USD' }
        : undefined,
    createdAt: toISODate(raw.created_date),
    metadata: raw as Record<string, unknown>,
  }
}
