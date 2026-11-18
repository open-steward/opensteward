import type { Label, LabelFormat } from '../../../schema/label'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface CargoOneLabel {
  id?: string | null
  shipment_id?: string | null
  tracking_number?: string | null
  carrier_id?: string | null
  service_code?: string | null
  format?: string | null
  status?: string | null
  url?: string | null
  base64?: string | null
  amount?: number | string | null
  currency?: string | null
  voided_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapLabelFormat(raw: string | null | undefined): LabelFormat | undefined {
  if (!raw) return undefined
  const f = raw.toUpperCase()
  if (f === 'PDF') return 'PDF'
  if (f === 'PNG') return 'PNG'
  if (f === 'ZPL') return 'ZPL'
  if (f === 'EPL2') return 'EPL2'
  return undefined
}

function mapLabelStatus(raw: string | null | undefined): Label['status'] {
  if (!raw) return undefined
  const s = raw.toUpperCase()
  if (s === 'CREATED') return 'CREATED'
  if (s === 'USED') return 'USED'
  if (s === 'REFUNDED' || s === 'VOIDED') return 'VOIDED'
  return undefined
}

export function transformLabel(raw: CargoOneLabel): Label {
  return {
    id: raw.id ?? undefined,
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier_id ?? undefined,
    serviceCode: raw.service_code ?? undefined,
    format: mapLabelFormat(raw.format),
    status: mapLabelStatus(raw.status) ?? 'CREATED',
    url: raw.url ?? undefined,
    base64: raw.base64 ?? undefined,
    cost:
      raw.amount != null && raw.currency
        ? {
            amount: parseDecimal(raw.amount) ?? 0,
            currency: raw.currency,
          }
        : undefined,
    voidedAt: toISODate(raw.voided_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
