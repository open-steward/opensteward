/**
 * Amazon SP-API Shipping v2 — collection form responses → canonical Manifest.
 *
 * Amazon's manifesting concept is the "collection form": the end-of-day
 * document a carrier driver scans to collect every label purchased under a
 * carrier account. Three endpoints are relevant:
 *   - POST /shipping/v2/collectionForms  (generateCollectionForm)
 *     Returns { collectionsFormDocument: { base64EncodedContent, documentFormat } }
 *   - GET  /shipping/v2/collectionForms/{collectionFormId}  (getCollectionForm)
 *     Same shape — reprints the form.
 *   - PUT  /shipping/v2/collectionForms/history  (getCollectionFormHistory)
 *     Returns collectionFormsHistoryRecordList[] with collectionFormId,
 *     carrierName, creationDate, generationStatus, shipFromAddress.
 *
 * The history endpoint backs listManifests; generate/get back
 * createManifest/getManifest.
 *
 * Self-contained copy of `amazon-shipping/transform/manifest.ts`. Adapters in
 * this repo never import across adapter directories — each stands alone so
 * one can change without dragging its neighbour — so the shape is duplicated
 * here rather than shared. Raw types carry this adapter's `SpApi` prefix.
 *
 * Two places the spec disagrees with itself, both tolerated here:
 *   - `GenerationStatus` is enumerated as `Completed` | `InProgress`, but the
 *     spec's own response example shows `COMPLETED`. The status map is
 *     case-insensitive so either spelling lands on the same canonical value.
 *   - `creationDate` is typed `string` (dateTime) but the example is epoch
 *     milliseconds (`1650163712052`). `toISODate` accepts both.
 *
 * Docs: https://github.com/amzn/selling-partner-api-models/blob/main/models/shipping-api-model/shippingV2.json
 *       operationIds: generateCollectionForm, getCollectionForm, getCollectionFormHistory
 */
import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ─── Raw types ───────────────────────────────────────────────────────────────

export interface SpApiCollectionsFormDocument {
  base64EncodedContent?: string | null
  documentFormat?: string | null
  [key: string]: unknown
}

export interface SpApiCollectionFormResponse {
  collectionsFormDocument?: SpApiCollectionsFormDocument | null
  collectionFormId?: string | null
  [key: string]: unknown
}

export interface SpApiCollectionFormsHistoryRecord {
  collectionFormId?: string | null
  /** The spec's record carries `carrierName` only; `carrierId` is read first in case a newer model adds it. */
  carrierName?: string | null
  carrierId?: string | null
  creationDate?: string | number | null
  generationStatus?: string | null
  shipFromAddress?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface SpApiGetCollectionFormHistoryResponse {
  collectionFormsHistoryRecordList?: SpApiCollectionFormsHistoryRecord[] | null
  lastRefreshedDate?: string | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapManifestStatus(status: string | null | undefined): ManifestStatus {
  switch (status?.toLowerCase()) {
    case 'completed':
      return 'SUBMITTED'
    case 'inprogress':
      return 'OPEN'
    default:
      return 'unknown'
  }
}

// ─── Transforms ──────────────────────────────────────────────────────────────

/**
 * Transform a generateCollectionForm / getCollectionForm response.
 * These endpoints return only the document — no id, no carrier — so the
 * caller supplies what it already knows: the id from the request path for
 * getCollectionForm, the carrierId from the request body for generate.
 */
export function transformManifestFromDocument(
  raw: SpApiCollectionFormResponse,
  collectionFormId?: string,
  carrierId?: string,
): Manifest {
  return {
    id: collectionFormId ?? raw.collectionFormId ?? undefined,
    carrierId: carrierId ?? undefined,
    // The document exists, so generation has completed.
    status: 'SUBMITTED',
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Transform a history record (from getCollectionFormHistory) into a Manifest.
 */
export function transformManifestFromHistory(raw: SpApiCollectionFormsHistoryRecord): Manifest {
  return {
    id: raw.collectionFormId ?? undefined,
    carrierId: raw.carrierId ?? raw.carrierName ?? undefined,
    status: mapManifestStatus(raw.generationStatus),
    createdAt: toISODate(raw.creationDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function extractManifestHistory(
  raw: SpApiGetCollectionFormHistoryResponse,
): SpApiCollectionFormsHistoryRecord[] {
  return raw.collectionFormsHistoryRecordList ?? []
}
