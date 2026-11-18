import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import {
  STATUS_FAILED,
  STATUS_FINISHED,
  STATUS_NEW,
  STATUS_PARTIAL_SIGNED,
} from '../constants'

/**
 * A StepOver signature request ("document") as the adapter sees it. The Tyr
 * web service does not return a structured object — only the numeric status
 * from `tyrservice.getDocumentSignatureRequestStatus`. The adapter therefore
 * assembles this minimal shape from the document id + status code it queried.
 */
export interface RawStepoverDocument {
  documentId: number
  statusId: number
}

/** Human-readable label for a Tyr status code, surfaced under metadata. */
function statusLabel(statusId: number): string {
  switch (statusId) {
    case STATUS_NEW:
      return 'new'
    case STATUS_PARTIAL_SIGNED:
      return 'partial_signed'
    case STATUS_FINISHED:
      return 'finished'
    case STATUS_FAILED:
      return 'failed'
    default:
      return 'unknown'
  }
}

function mapStatus(statusId: number): EnvelopeStatus {
  switch (statusId) {
    case STATUS_NEW:
      // The request exists and is awaiting signatures.
      return 'sent'
    case STATUS_PARTIAL_SIGNED:
      return 'delivered'
    case STATUS_FINISHED:
      return 'completed'
    case STATUS_FAILED:
      // A failed signature request is no longer actionable; void is the
      // closest canonical terminal state ('failed' is not in the enum).
      return 'voided'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawStepoverDocument): Envelope {
  const id = String(raw.documentId)
  return {
    id,
    externalId: id,
    status: mapStatus(raw.statusId),
    // The Tyr status endpoint does not return the document's display name; the
    // canonical subject is required, so default to the id-derived label.
    subject: `webSignatureOffice document ${id}`,
    // StepOver has no recipient-read endpoint, so signer/document ids are not
    // queryable; the envelope carries only what the status query exposes.
    signingOrder: 'parallel',
    signerIds: [],
    documentIds: [id],
    platform: 'stepover',
    metadata: {
      statusId: String(raw.statusId),
      statusLabel: statusLabel(raw.statusId),
    },
    raw,
  }
}
