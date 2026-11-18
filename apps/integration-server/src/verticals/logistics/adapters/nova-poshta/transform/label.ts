import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import { NOVA_POSHTA_CARRIER_ID } from '../constants'

/**
 * Nova Poshta label information.
 * Label data is typically embedded in the shipment response — the labelUrl
 * and TTN (tracking number) are the primary fields.
 */
export interface NovaPoshtaLabel {
  id?: string | null
  shipmentId?: string | null
  number?: string | null          // TTN (tracking number)
  labelUrl?: string | null
  labelBase64?: string | null
  serviceCode?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformLabel(raw: NovaPoshtaLabel): Label {
  return {
    id: raw.id ?? raw.shipmentId ?? undefined,
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.number ?? undefined,
    carrierId: NOVA_POSHTA_CARRIER_ID,
    serviceCode: raw.serviceCode ?? undefined,
    format: raw.labelUrl ? 'PDF' : undefined,
    status: 'CREATED',
    url: raw.labelUrl ?? undefined,
    base64: raw.labelBase64 ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
