import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// NZ Post ParcelLabel API v3 — POST /parcellabel/v3/labels
// Create response returns consignment_id; the GET status endpoint returns label details.

export interface NZPostLabelParcel {
  tracking_reference?: string
  label_id?: string
  [key: string]: unknown
}

export interface NZPostLabelCreateResponse {
  /** Unique identifier for the consignment. */
  consignment_id: string
  /** Hosted PDF URL: https://api.nzpost.co.nz/parcellabel/v3/labels/{consignment_id}?format=PDF */
  consignment_url?: string
  message_id?: string
  success?: boolean
  labels?: NZPostLabelParcel[]
  [key: string]: unknown
}

export function transformLabel(raw: NZPostLabelCreateResponse): Label {
  const firstLabel = raw.labels?.[0]
  return {
    id: raw.consignment_id,
    shipmentId: raw.consignment_id,
    trackingNumber: firstLabel?.tracking_reference ?? undefined,
    carrierId: 'nzpost',
    serviceCode: undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.consignment_url ?? undefined,
    base64: undefined,
    cost: undefined,
    refundAt: undefined,
    voidedAt: undefined,
    createdAt: toISODate(new Date().toISOString()),
    updatedAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
