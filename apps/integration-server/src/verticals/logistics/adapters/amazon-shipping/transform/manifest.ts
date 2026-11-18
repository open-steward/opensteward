/**
 * Amazon Shipping v2 — collection form responses → canonical Manifest.
 *
 * Amazon Shipping's manifesting concept is called a "collection form". Two
 * endpoints are relevant:
 *   - POST /shipping/v2/collectionForms  (generateCollectionForm)
 *     Returns { collectionsFormDocument: { base64EncodedContent, documentFormat } }
 *   - GET  /shipping/v2/collectionForms/{collectionFormId}  (getCollectionForm)
 *     Same shape — reprints the form.
 *   - PUT  /shipping/v2/collectionForms/history  (getCollectionFormHistory)
 *     Returns collectionFormsHistoryRecordList[]  with collectionFormId,
 *     carrierName, creationDate, generationStatus, shipFromAddress.
 *
 * The history endpoint is used for listManifests; the generate/get endpoints
 * are used for createManifest/getManifest.
 *
 * Docs: https://github.com/amzn/selling-partner-api-models/blob/main/models/shipping-api-model/shippingV2.json
 *       operationIds: generateCollectionForm, getCollectionForm, getCollectionFormHistory
 */
import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ─── Raw types ───────────────────────────────────────────────────────────────

export interface AmazonCollectionsFormDocument {
  base64EncodedContent?: string | null
  documentFormat?: string | null
  [key: string]: unknown
}

export interface AmazonCollectionFormResponse {
  collectionsFormDocument?: AmazonCollectionsFormDocument | null
  collectionFormId?: string | null
  [key: string]: unknown
}

export interface AmazonCollectionFormsHistoryRecord {
  collectionFormId?: string | null
  carrierName?: string | null
  carrierId?: string | null
  creationDate?: string | null
  generationStatus?: string | null
  shipFromAddress?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface AmazonGetCollectionFormHistoryResponse {
  collectionFormsHistoryRecordList?: AmazonCollectionFormsHistoryRecord[] | null
  lastRefreshedDate?: string | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapManifestStatus(status: string | null | undefined): ManifestStatus {
  switch (status) {
    case 'Completed':
      return 'SUBMITTED'
    case 'InProgress':
      return 'OPEN'
    default:
      return 'UNKNOWN'
  }
}

// ─── Transforms ──────────────────────────────────────────────────────────────

/**
 * Transform a generateCollectionForm / getCollectionForm response.
 * These endpoints do not return an id in the response body itself — the
 * collectionFormId comes back in the history. We accept an optional id
 * that callers can supply (e.g. from the request path for getCollectionForm).
 */
export function transformManifestFromDocument(
  raw: AmazonCollectionFormResponse,
  collectionFormId?: string,
): Manifest {
  return {
    id: collectionFormId ?? raw.collectionFormId ?? undefined,
    status: 'SUBMITTED',
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Transform a history record (from getCollectionFormHistory) into a Manifest.
 */
export function transformManifestFromHistory(
  raw: AmazonCollectionFormsHistoryRecord,
): Manifest {
  return {
    id: raw.collectionFormId ?? undefined,
    carrierId: raw.carrierId ?? raw.carrierName ?? undefined,
    status: mapManifestStatus(raw.generationStatus),
    createdAt: toISODate(raw.creationDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function extractManifestHistory(
  raw: AmazonGetCollectionFormHistoryResponse,
): AmazonCollectionFormsHistoryRecord[] {
  return raw.collectionFormsHistoryRecordList ?? []
}
