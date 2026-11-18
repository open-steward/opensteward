import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ─── FedEx raw types ─────────────────────────────────────────────────────────
// EndOfDayCloseOutputVO from FedEx's Close API spec
// (CloseAPI_ShipmentCloseAPI-Resource.json, PUT /ship/v1/endofday/).

export interface FedExCloseAlert {
  code?: string | null
  alertType?: string | null
  message?: string | null
  [key: string]: unknown
}

export interface FedExCloseDocumentPart {
  documentPartSequenceNumber?: number | null
  /** Base64 image (or printer commands) for this part of the report. */
  image?: string | null
  [key: string]: unknown
}

export interface FedExCloseDocument {
  /** 'MANIFEST' | 'OP_950' */
  type?: string | null
  /** FedEx's own identifier for the shipping cycle this close covers. */
  shippingCycle?: string | null
  shippingDocumentDisposition?: string | null
  accessReference?: string | null
  resolution?: number | null
  copiesToPrint?: number | null
  parts?: FedExCloseDocumentPart[] | null
  [key: string]: unknown
}

export interface FedExEndOfDayOutput {
  alerts?: FedExCloseAlert[] | null
  closeDocuments?: FedExCloseDocument[] | null
  [key: string]: unknown
}

export interface FedExEndOfDayResponse {
  transactionId?: string
  output?: FedExEndOfDayOutput
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * Maps a FedEx Ground End of Day Close response to the canonical Manifest.
 *
 * `PUT /ship/v1/endofday/` with `closeReqType: 'GCDR'` closes every open
 * FedEx Ground shipment on the account for `closeDate` and returns the close
 * reports (MANIFEST and/or OP_950) as base64 parts. The response names no
 * tracking numbers, so `shipmentIds` and `labelCount` stay undefined rather
 * than being fabricated from the request. ManifestSchema has no document
 * field — the report images are reachable through
 * `metadata.closeDocuments[].parts[].image`.
 *
 * Follows the GLS-DE end-of-day precedent: id is synthesised from the date.
 */
export function transformManifest(raw: FedExEndOfDayOutput, closeDate: string): Manifest {
  const shippingCycle = raw.closeDocuments?.find((doc) => doc.shippingCycle)?.shippingCycle

  return {
    id: `eod-${closeDate}`,
    carrierId: 'fedex',
    manifestNumber: shippingCycle ?? undefined,
    status: 'CLOSED',
    submittedAt: toISODate(closeDate),
    createdAt: toISODate(closeDate),
    metadata: raw as Record<string, unknown>,
  }
}
