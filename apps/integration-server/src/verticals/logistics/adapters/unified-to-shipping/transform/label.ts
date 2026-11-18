import type { Label, LabelFormat, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/** Unified.to ShippingLabel response shape. */
export interface UnifiedShippingLabel {
  id?: string | null
  shipmentId?: string | null
  trackingNumber?: string | null
  serviceCode?: string | null
  rateId?: string | null
  labelUrl?: string | null
  labelFormat?: string | null
  labelCost?: number | null
  labelCostCurrency?: string | null
  status?: string | null
  isVoided?: boolean | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  raw?: Record<string, unknown> | null
  [key: string]: unknown
}

function mapLabelFormat(fmt: string | null | undefined): LabelFormat | undefined {
  if (!fmt) return undefined
  const f = fmt.toUpperCase()
  if (f === 'PDF') return 'PDF'
  if (f === 'PNG') return 'PNG'
  if (f === 'ZPL') return 'ZPL'
  if (f === 'EPL2' || f === 'EPL') return 'EPL2'
  return undefined
}

function mapLabelStatus(raw: UnifiedShippingLabel): LabelStatus | undefined {
  if (raw.isVoided) return 'VOIDED'
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'LABEL_CREATED' || s === 'CREATED' || s === 'PENDING' || s === 'PROCESSING') return 'CREATED'
  if (s === 'IN_TRANSIT' || s === 'DELIVERED' || s === 'OUT_FOR_DELIVERY' || s === 'PICKED_UP') return 'USED'
  if (s === 'CANCELLED') return 'VOIDED'
  return undefined
}

export function transformLabel(raw: UnifiedShippingLabel): Label {
  return {
    id: raw.id ?? undefined,
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    serviceCode: raw.serviceCode ?? undefined,
    format: mapLabelFormat(raw.labelFormat),
    status: mapLabelStatus(raw),
    url: raw.labelUrl ?? undefined,
    cost:
      raw.labelCost != null
        ? {
            amount: raw.labelCost,
            currency: raw.labelCostCurrency ?? 'USD',
          }
        : undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
