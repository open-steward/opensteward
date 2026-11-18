import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

/**
 * Shipium manifest request payload — used for
 * POST /api/v2/manifest/carrier
 *
 * Shipium's manifest API is a fire-and-forget operation: the response on
 * success is a 200 with the message "Manifested shipments successfully" and
 * no manifest object in the body.  We synthesise a canonical Manifest from
 * the request parameters to return something meaningful to the caller.
 */
export interface ShipiumManifestRequest {
  carrierId?: string | null
  carrierAccountId?: string | null
  cargoServiceMethodIds?: string[] | null
  fulfillmentContextId?: string | null
  postalCode?: string | null
  countryCode?: string | null
  previousManifestDateTime?: string | null
  toDateTime?: string | null
  testMode?: boolean | null
  [key: string]: unknown
}

export function transformManifestFromRequest(
  req: ShipiumManifestRequest,
  submittedAt?: Date,
): Manifest {
  return {
    carrierId: req.carrierId ?? undefined,
    status: 'SUBMITTED',
    submittedAt: submittedAt ?? new Date(),
    createdAt: submittedAt ?? new Date(),
    metadata: req as Record<string, unknown>,
  }
}

/**
 * Placeholder raw manifest type — used when we receive a manifest-like
 * object in webhook events or other responses that include manifest metadata.
 */
export interface ShipiumManifestRaw {
  shipiumManifestId?: string | null
  manifestJobId?: string | null
  carrierId?: string | null
  carrierAccountId?: string | null
  submittedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  status?: string | null
  [key: string]: unknown
}

export function transformManifest(raw: ShipiumManifestRaw): Manifest {
  return {
    id: raw.shipiumManifestId ?? raw.manifestJobId ?? undefined,
    carrierId: raw.carrierId ?? undefined,
    manifestNumber: raw.manifestJobId ?? undefined,
    status: 'SUBMITTED',
    submittedAt: toISODate(raw.submittedAt),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
