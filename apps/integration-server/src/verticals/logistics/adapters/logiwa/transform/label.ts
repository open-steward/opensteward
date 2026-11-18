import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate, parseDecimal } from '../../shared/transform'

// Response package entry from POST /v3.1/CustomCarrier/create
export interface LogiwaLabelPackage {
  packageReference?: string | null
  trackingNumber?: string | null
  labelData?: string | null
  labelUrl?: string | null
  labelFormat?: string | null
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
  [key: string]: unknown
}

export interface LogiwaLabelRateDetail {
  totalAmount?: number | null
  currency?: string | null
  [key: string]: unknown
}

// Top-level response from POST /v3.1/CustomCarrier/create
export interface LogiwaLabelResponse {
  shipmentOrderIdentifier?: string | null
  shipmentOrderCode?: string | null
  masterTrackingNumber?: string | null
  carrier?: string | null
  shippingOption?: string | null
  packageResponse?: LogiwaLabelPackage[]
  rateDetail?: LogiwaLabelRateDetail | null
  isSuccessful?: boolean
  voidedAt?: string | null
  createdAt?: string | null
  [key: string]: unknown
}

function mapLabelStatus(raw: LogiwaLabelResponse): LabelStatus {
  if (raw.voidedAt) return 'VOIDED'
  if (raw.isSuccessful === false) return 'VOIDED'
  return 'CREATED'
}

export function transformLabel(raw: LogiwaLabelResponse): Label {
  const pkg = raw.packageResponse?.[0]
  const totalAmount = parseDecimal(raw.rateDetail?.totalAmount)

  return {
    id: raw.shipmentOrderIdentifier ?? undefined,
    shipmentId: raw.shipmentOrderIdentifier ?? undefined,
    trackingNumber: pkg?.trackingNumber ?? raw.masterTrackingNumber ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.shippingOption ?? undefined,
    status: mapLabelStatus(raw),
    url: pkg?.labelUrl ?? undefined,
    base64: pkg?.labelData ?? undefined,
    cost:
      totalAmount != null && raw.rateDetail?.currency
        ? { amount: Math.round(totalAmount * 100), currency: raw.rateDetail.currency }
        : undefined,
    voidedAt: toISODate(raw.voidedAt),
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
