import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'
import type { RawSignaturelyDocumentSigner } from './envelope'

/**
 * `GET /documents/:documentId/signers` returns `{ data: [{ id, name, order,
 * role, email }] }`. The richer signer objects nested on a document carry
 * additionally `isPreparer`, `isFinished`, `isDeclined` and
 * `isReceivingReminders`, which we use to derive status. The same transform
 * handles both shapes.
 */
export type RawSignaturelySigner = RawSignaturelyDocumentSigner

function mapStatus(raw: RawSignaturelySigner): SignerStatus {
  if (raw.isDeclined) return 'declined'
  if (raw.isFinished) return 'signed'
  return 'sent'
}

export function transformSigner(raw: RawSignaturelySigner, envelopeId: string): Signer {
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: raw.isPreparer ? 'editor' : 'signer',
    status: mapStatus(raw),
    routingOrder: typeof raw.order === 'number' && raw.order >= 1 ? raw.order : undefined,
    platform: 'signaturely',
    metadata: strMap({
      role: raw.role,
      isPreparer: raw.isPreparer,
      isReceivingReminders: raw.isReceivingReminders,
    }),
    raw,
  }
}
