import type { Label, LabelFormat, LabelStatus } from '../../../schema/label'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface ShipEngineLabelMonetaryValue {
  currency: string
  amount: number
}

export interface ShipEngineLabelDownload {
  href?: string | null
  pdf?: string | null
  png?: string | null
  zpl?: string | null
}

export interface ShipEngineLabel {
  label_id: string
  status: string
  shipment_id?: string | null
  ship_date?: string | null
  created_at?: string | null
  shipment_cost?: ShipEngineLabelMonetaryValue | null
  insurance_cost?: ShipEngineLabelMonetaryValue | null
  requested_comparison_amount?: ShipEngineLabelMonetaryValue | null
  rate_response?: {
    rates?: unknown[]
    invalid_rates?: unknown[]
    rate_request_id?: string | null
    shipment_id?: string | null
    status?: string | null
  } | null
  is_return_label?: boolean | null
  rma_number?: string | null
  is_international?: boolean | null
  display_scheme?: string | null
  label_format?: string | null
  label_layout?: string | null
  trackable?: boolean | null
  label_image_id?: string | null
  carrier_id?: string | null
  carrier_code?: string | null
  service_code?: string | null
  package_code?: string | null
  voided?: boolean | null
  voided_at?: string | null
  label_download?: ShipEngineLabelDownload | null
  form_download?: { href?: string | null } | null
  insurance_claim?: unknown | null
  packages?: Array<{
    tracking_number?: string | null
    [key: string]: unknown
  }>
  tracking_number?: string | null
  [key: string]: unknown
}

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  if (!format) return undefined
  switch (format.toLowerCase()) {
    case 'pdf':
      return 'PDF'
    case 'png':
      return 'PNG'
    case 'zpl':
      return 'ZPL'
    case 'epl2':
      return 'EPL2'
    default:
      return undefined
  }
}

function mapLabelStatus(status: string | null | undefined): LabelStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'completed':
      return 'CREATED'
    case 'voided':
      return 'VOIDED'
    case 'refunded':
      return 'REFUNDED'
    default:
      return 'CREATED'
  }
}

export function transformLabel(raw: ShipEngineLabel): Label {
  const trackingNumber = raw.tracking_number ?? raw.packages?.[0]?.tracking_number ?? undefined

  const totalCost =
    (parseDecimal(raw.shipment_cost?.amount) ?? 0) + (parseDecimal(raw.insurance_cost?.amount) ?? 0)

  const currency = raw.shipment_cost?.currency ?? undefined

  return {
    id: raw.label_id,
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: trackingNumber ?? undefined,
    carrierId: raw.carrier_id ?? raw.carrier_code ?? undefined,
    serviceCode: raw.service_code ?? undefined,
    format: mapLabelFormat(raw.label_format),
    status: mapLabelStatus(raw.status),
    url: raw.label_download?.href ?? raw.label_download?.pdf ?? undefined,
    cost: totalCost > 0 && currency ? { amount: Math.round(totalCost * 100), currency } : undefined,
    voidedAt: toISODate(raw.voided_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
