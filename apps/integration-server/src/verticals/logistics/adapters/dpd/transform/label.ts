import type { Label, LabelFormat, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface DPDLabelResponse {
  // DPD returns label data for a shipment (GET /shipping/shipment/{id}/label/)
  shipmentId: string | null
  labelType: string | null
  // PDF/ZPL label content encoded in base64
  label: string | null
  // Label URL if hosted (not always present)
  labelUrl: string | null
  consignmentNumber: string | null
  networkCode: string | null
  generatedAt: string | null
  [key: string]: unknown
}

function mapLabelFormat(labelType: string | null): LabelFormat {
  switch ((labelType ?? '').toUpperCase()) {
    case 'PDF':  return 'PDF'
    case 'PNG':  return 'PNG'
    case 'ZPL':  return 'ZPL'
    case 'EPL':
    case 'EPL2': return 'EPL2'
    default:     return 'PDF'
  }
}

function mapLabelStatus(raw: DPDLabelResponse): LabelStatus {
  // DPD labels are created upon shipment allocation; voided via DELETE on shipment
  if (raw.label || raw.labelUrl) return 'CREATED'
  return 'CREATED'
}

export function transformLabel(raw: DPDLabelResponse, shipmentId: string): Label {
  return {
    id: raw.shipmentId ?? shipmentId,
    shipmentId: raw.shipmentId ?? shipmentId,
    trackingNumber: raw.consignmentNumber ?? undefined,
    carrierId: 'dpd',
    serviceCode: raw.networkCode ?? undefined,
    format: mapLabelFormat(raw.labelType),
    status: mapLabelStatus(raw),
    url: raw.labelUrl ?? undefined,
    base64: raw.label ?? undefined,
    createdAt: toISODate(raw.generatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
