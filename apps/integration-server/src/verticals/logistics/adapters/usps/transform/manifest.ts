import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// Response shape from POST scan-forms/v3/scan-form
// Confirmed from https://github.com/USPS/api-examples (SCANForm-LabelShipment-response.json)
export interface USPSScanFormResponse {
  form: string | null
  imageType: string | null
  labelType: string | null
  mailingDate: string | null
  overwriteMailingDate: boolean | null
  entryFacilityZIPCode: string | null
  destinationEntryFacilityType: string | null
  shipment: {
    trackingNumbers: string[]
  } | null
  manifestNumber: string | null
  trackingNumbers: string[] | null
  fromAddress: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformManifest(raw: USPSScanFormResponse): Manifest {
  const trackingNumbers =
    raw.trackingNumbers ?? raw.shipment?.trackingNumbers ?? []

  const status: ManifestStatus = 'SUBMITTED'

  return {
    id: raw.manifestNumber ?? undefined,
    carrierId: 'usps',
    manifestNumber: raw.manifestNumber ?? undefined,
    status,
    shipmentIds: trackingNumbers.length > 0 ? trackingNumbers : undefined,
    labelCount: trackingNumbers.length > 0 ? trackingNumbers.length : undefined,
    submittedAt: raw.mailingDate ? toISODate(raw.mailingDate) : undefined,
    createdAt: raw.mailingDate ? toISODate(raw.mailingDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
