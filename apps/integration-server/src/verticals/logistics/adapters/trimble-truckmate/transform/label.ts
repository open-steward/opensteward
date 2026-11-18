import type { Label, LabelStatus, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface TrimbleTruckmateLabelResponse {
  id?: string
  labelId?: string
  shipmentId?: string
  tripId?: string
  trackingNumber?: string
  carrierId?: string
  serviceCode?: string
  serviceType?: string
  format?: string
  labelFormat?: string
  status?: string
  labelStatus?: string
  url?: string
  labelUrl?: string
  base64?: string
  labelData?: string
  totalPrice?: number
  currency?: string
  refundAt?: string
  voidedAt?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

const FORMAT_MAP: Record<string, LabelFormat> = {
  PDF: 'PDF',
  PNG: 'PNG',
  ZPL: 'ZPL',
  EPL2: 'EPL2',
}

const STATUS_MAP: Record<string, LabelStatus> = {
  CREATED: 'CREATED',
  USED: 'USED',
  REFUNDED: 'REFUNDED',
  VOIDED: 'VOIDED',
}

function mapFormat(raw: string | undefined): LabelFormat | undefined {
  if (!raw) return undefined
  return FORMAT_MAP[raw.toUpperCase()] ?? undefined
}

function mapStatus(raw: string | undefined): LabelStatus | undefined {
  if (!raw) return undefined
  return STATUS_MAP[raw.toUpperCase()] ?? undefined
}

export function transformLabel(raw: TrimbleTruckmateLabelResponse): Label {
  const id = raw.labelId ?? raw.id ?? undefined
  const totalPrice = raw.totalPrice

  return {
    id,
    shipmentId: raw.shipmentId ?? raw.tripId ?? undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: raw.carrierId ?? 'trimble-truckmate',
    serviceCode: raw.serviceCode ?? raw.serviceType ?? undefined,
    format: mapFormat(raw.labelFormat ?? raw.format),
    status: mapStatus(raw.labelStatus ?? raw.status),
    url: raw.url ?? raw.labelUrl ?? undefined,
    base64: raw.base64 ?? raw.labelData ?? undefined,
    cost: totalPrice != null && raw.currency
      ? { amount: Math.round(totalPrice * 100), currency: raw.currency }
      : undefined,
    refundAt: toISODate(raw.refundAt),
    voidedAt: toISODate(raw.voidedAt),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
