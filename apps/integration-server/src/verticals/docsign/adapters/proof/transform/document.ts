import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawProofDocument } from './envelope'

/**
 * Proof documents — metadata only. Proof never returns the binary on the
 * transaction list; the presigned `final_document_url` is intentionally not
 * surfaced (content is REFUSED at the canonical-schema level). Proof omits a
 * page count and byte size from the document object, so those stay undefined.
 */
export function transformDocument(
  raw: RawProofDocument,
  transactionId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.id) ?? `${transactionId}:${index}`
  return {
    id: `${transactionId}:${externalId}`,
    externalId,
    envelopeId: transactionId,
    name: pickStr(raw.document_name) ?? '',
    mimeType: 'application/pdf',
    order: typeof raw.bundle_position === 'number' ? raw.bundle_position : index,
    platform: 'proof',
    metadata: strMap({
      requirement: raw.requirement,
      completionState: raw.completion_state,
      processingState: raw.processing_state,
      esignRequired: typeof raw.esign_required === 'boolean' ? String(raw.esign_required) : undefined,
      notarizationRequired:
        typeof raw.notarization_required === 'boolean' ? String(raw.notarization_required) : undefined,
      identityConfirmationRequired:
        typeof raw.identity_confirmation_required === 'boolean'
          ? String(raw.identity_confirmation_required)
          : undefined,
      isEnote: typeof raw.is_enote === 'boolean' ? String(raw.is_enote) : undefined,
    }),
    raw,
  }
}
