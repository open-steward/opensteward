import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

/**
 * PostNL Confirming webservice → canonical Manifest.
 *
 * PostNL has no explicit "manifest" resource; the closest equivalent is the
 * Confirming webservice, which submits a batch of barcodes into the PostNL
 * distribution process.
 *
 * Endpoint:
 *   POST https://api.postnl.nl/shipment/v2/confirm
 *
 * Request body (simplified):
 *   {
 *     Customer: { CustomerCode, CustomerNumber, CollectionLocation },
 *     Message: { MessageID, MessageTimeStamp },
 *     Shipments: [{ Barcode, Addresses: [...], Dimension: {...}, ... }]
 *   }
 *
 * Response body (ConfirmingResponse):
 *   {
 *     ConfirmingResponseShipment: [
 *       { Barcode, Errors: [...], Warnings: [...] }
 *     ]
 *   }
 *
 * A successful response has an empty Errors array per barcode. We derive
 * ManifestStatus from whether errors are present in the response.
 */

// ─── PostNL raw types ────────────────────────────────────────────────────────

export interface PostNLConfirmingError {
  Code?: string | null
  Description?: string | null
  [key: string]: unknown
}

export interface PostNLConfirmingResponseShipment {
  Barcode?: string | null
  Errors?: PostNLConfirmingError[] | null
  Warnings?: PostNLConfirmingError[] | null
  [key: string]: unknown
}

export interface PostNLConfirmingResponse {
  ConfirmingResponseShipment?: PostNLConfirmingResponseShipment[] | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function deriveStatus(
  shipments: PostNLConfirmingResponseShipment[],
): ManifestStatus {
  const hasErrors = shipments.some(
    (s) => s.Errors && s.Errors.length > 0,
  )
  return hasErrors ? 'OPEN' : 'SUBMITTED'
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformManifest(
  raw: PostNLConfirmingResponse,
  messageId?: string,
): Manifest {
  const shipments = raw.ConfirmingResponseShipment ?? []
  const shipmentIds = shipments
    .map((s) => s.Barcode)
    .filter((b): b is string => typeof b === 'string' && b.length > 0)

  const status = deriveStatus(shipments)

  return {
    id: messageId ?? undefined,
    carrierId: 'postnl',
    manifestNumber: messageId ?? undefined,
    status,
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    labelCount: shipmentIds.length || undefined,
    submittedAt: status === 'SUBMITTED' ? toISODate(new Date().toISOString()) : undefined,
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
