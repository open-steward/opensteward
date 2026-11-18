/**
 * Label transform for DTDC.
 *
 * DTDC does not expose a dedicated /labels endpoint.  A shipping label URL is
 * returned inside the shipment creation response (`label_url`).  This transform
 * derives a Label record from that same raw shipment payload so callers get a
 * consistent Label object without a second API call.
 */

import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface DtdcLabelRaw {
  /** Shared with DtdcShipmentRaw — same payload doubles as a label source. */
  id?: string | null
  shipment_id?: string | null
  tracking_number?: string | null
  label_url?: string | null
  label_format?: string | null
  label_data?: string | null
  status?: string | null
  service_code?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapLabelFormat(fmt: string | null | undefined): Label['format'] {
  if (!fmt) return undefined
  const f = fmt.toUpperCase()
  if (f.includes('PDF')) return 'PDF'
  if (f.includes('PNG')) return 'PNG'
  if (f.includes('ZPL')) return 'ZPL'
  if (f.includes('EPL')) return 'EPL2'
  return undefined
}

function mapLabelStatus(status: string | null | undefined): Label['status'] {
  if (!status) return undefined
  const s = status.toUpperCase()
  if (s.includes('VOID') || s.includes('CANCEL')) return 'VOIDED'
  if (s.includes('REFUND')) return 'REFUNDED'
  if (s.includes('USED') || s.includes('TRANSIT') || s.includes('DELIVER')) return 'USED'
  return 'CREATED'
}

export function transformLabel(raw: DtdcLabelRaw): Label {
  return {
    id: raw.id ?? raw.shipment_id ?? undefined,
    shipmentId: raw.shipment_id ?? raw.id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'dtdc',
    serviceCode: raw.service_code ?? undefined,
    format: mapLabelFormat(raw.label_format),
    status: mapLabelStatus(raw.status),
    url: raw.label_url ?? undefined,
    base64: raw.label_data ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
