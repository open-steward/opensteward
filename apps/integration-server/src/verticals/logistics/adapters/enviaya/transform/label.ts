import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate, parseDecimal } from '../../shared/transform'

export interface EnviaYaLabel {
  enviaya_shipment_number?: string | null
  carrier_shipment_number?: string | null
  carrier?: string | null
  carrier_service_code?: string | null
  label_url?: string | null
  file_format?: string | null
  total_amount?: number | string | null
  currency?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toUpperCase()
  if (f === 'PDF') return 'PDF'
  if (f === 'PNG') return 'PNG'
  if (f === 'ZPL') return 'ZPL'
  if (f === 'EPL' || f === 'EPL2') return 'EPL2'
  return undefined
}

export function transformLabel(raw: EnviaYaLabel): Label {
  const costDecimal = parseDecimal(raw.total_amount)
  const costAmount = costDecimal != null ? Math.round(costDecimal * 100) : undefined

  return {
    id: raw.enviaya_shipment_number ?? undefined,
    shipmentId: raw.enviaya_shipment_number ?? undefined,
    trackingNumber: raw.carrier_shipment_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.carrier_service_code ?? undefined,
    format: mapLabelFormat(raw.file_format),
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    cost:
      costAmount != null
        ? {
            amount: costAmount,
            currency: (raw.currency as string | undefined) ?? 'MXN',
          }
        : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
