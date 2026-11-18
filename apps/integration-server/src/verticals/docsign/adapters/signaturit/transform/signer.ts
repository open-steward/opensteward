/**
 * Signaturit document item → canonical Signer.
 *
 * "A document item is created for every signer and uploaded file", and it
 * carries "email — The signer's email" and "name — The signer's name".
 */
import type { Signer, SignerStatus } from '../../../schema/signer'
import { itemKey, type RawSignaturitDocumentItem, type RawSignaturitEvent } from './envelope'
import { pickStr, requireStr, toIso } from './shared'

/** The documented document statuses, as the signer's progress. */
function mapStatus(s: string | undefined): SignerStatus {
  switch (s) {
    case 'in_queue': // "The document is being processed."
      return 'created'
    case 'ready': // "The document is ready to be signed."
      return 'sent'
    case 'completed': // "The document has been signed."
      return 'signed'
    case 'declined': // "The document has been declined."
      return 'declined'
    default:
      // signing, expired, canceled, error: no canonical signer status says it.
      return 'unknown'
  }
}

export function eventTime(
  events: RawSignaturitEvent[] | undefined,
  type: string,
): string | undefined {
  const found = (events ?? []).find((e) => e.type === type)
  return found ? toIso(found.created_at) : undefined
}

export function transformSigner(raw: RawSignaturitDocumentItem, envelopeId: string): Signer {
  const itemId = requireStr(raw.id, 'document id')
  const metadata: Record<string, string> = {}
  const status = pickStr(raw.status)
  if (status) metadata['documentStatus'] = status
  const fileName = pickStr(raw.file?.name)
  if (fileName) metadata['fileName'] = fileName
  return {
    id: itemKey(envelopeId, itemId),
    externalId: itemId,
    envelopeId,
    email: pickStr(raw.email),
    name: requireStr(raw.name, `signer name on document ${itemId}`),
    role: 'signer',
    status: mapStatus(status),
    signedAt: eventTime(raw.events, 'document_signed'),
    declinedAt: eventTime(raw.events, 'document_declined'),
    platform: 'signaturit',
    metadata,
    raw,
  }
}
