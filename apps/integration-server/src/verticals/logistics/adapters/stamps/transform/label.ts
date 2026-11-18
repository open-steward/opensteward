import type { Label } from '../../../schema/label'

export interface SeraLabelResponse {
  label_id: string
  tracking_number: string | null
  carrier: string | null
  service_type: string | null
  packaging_type: string | null
  estimated_delivery_days: string | null
  estimated_delivery_date: string | null
  is_guaranteed_service: boolean
  trackable: string | null
  shipment_cost: {
    total_amount: number
    currency: string
  } | null
  labels: Array<{ href: string }> | null
  [key: string]: unknown
}

export function transformLabel(raw: SeraLabelResponse): Label {
  const firstLabelUrl = raw.labels?.[0]?.href ?? undefined

  return {
    id: raw.label_id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service_type ?? undefined,
    status: 'CREATED',
    url: firstLabelUrl,
    cost:
      raw.shipment_cost
        ? {
            amount: raw.shipment_cost.total_amount,
            currency: raw.shipment_cost.currency,
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
