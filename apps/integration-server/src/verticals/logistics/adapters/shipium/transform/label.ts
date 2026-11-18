import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { ShipiumCarrierLabel } from './shipment'

function mapLabelFormat(fmt: string | null | undefined): LabelFormat | undefined {
  if (!fmt) return undefined
  const f = fmt.toLowerCase()
  if (f.includes('pdf')) return 'PDF'
  if (f.includes('png')) return 'PNG'
  if (f.includes('zpl')) return 'ZPL'
  if (f.includes('epl')) return 'EPL2'
  return undefined
}

function pickFirstDocument(label: ShipiumCarrierLabel): { url?: string; format?: LabelFormat } {
  const docs = label.documents ?? []
  // Prefer PDF
  const pdf = docs.find((d) => (d.labelFormat ?? '').toLowerCase().includes('pdf'))
  const first = pdf ?? docs[0]
  if (!first) return {}
  return {
    url: first.labelUrl ?? undefined,
    format: mapLabelFormat(first.labelFormat),
  }
}

export function transformLabel(
  raw: ShipiumCarrierLabel,
  shipmentId?: string,
  createdAt?: Date,
): Label {
  const { url, format } = pickFirstDocument(raw)
  return {
    id: raw.shipiumLabelId ?? undefined,
    shipmentId,
    trackingNumber: raw.carrierTrackingId ?? undefined,
    format,
    status: raw.status === 'voided' ? 'VOIDED' : 'CREATED',
    url,
    createdAt,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformLabelFromResponse(
  raw: ShipiumCarrierLabel,
  shipmentId?: string,
  createdAtRaw?: string | null,
): Label {
  return transformLabel(raw, shipmentId, toISODate(createdAtRaw))
}
