import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// Raw shape returned by:
//   GET  /shippingservices/v1/manifests/{manifestId}
//   POST /shippingservices/v1/manifests
// Docs: https://docs.shippingapi.pitneybowes.com/api/get-manifests.html
export interface PitneyBowesManifestDocument {
  type: string
  contentType: string
  contents: string
  [key: string]: unknown
}

export interface PitneyBowesManifestResponse {
  manifestId: string
  carrier?: string
  submissionDate?: string
  parcelTrackingNumbers?: string[]
  manifestTrackingNumber?: string
  documents?: PitneyBowesManifestDocument[]
  [key: string]: unknown
}

export function transformManifest(raw: PitneyBowesManifestResponse): Manifest {
  return {
    id: raw.manifestId,
    carrierId: raw.carrier ? raw.carrier.toLowerCase() : 'pitney-bowes',
    manifestNumber: raw.manifestTrackingNumber ?? raw.manifestId,
    status: 'SUBMITTED',
    shipmentIds: raw.parcelTrackingNumbers ?? undefined,
    labelCount: raw.parcelTrackingNumbers?.length,
    submittedAt: toISODate(raw.submissionDate),
    createdAt: toISODate(raw.submissionDate),
    metadata: raw as Record<string, unknown>,
  }
}
