import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import type { RawInsignDocument } from './document'
import type { RawInsignSignatureField } from './signer'

/**
 * inSign session ("Vorgang") → canonical Envelope.
 *
 * A session is the unit of signing work. The richest read is `/get/status`
 * (display name, TAN, modified timestamp, per-document + per-field signing
 * state) which we merge with `/get/checkstatus` for the lifecycle fields
 * (`status`, `processStep`, `completed`). inSign has no email subject/body
 * concept, so `subject` maps to the session `displayname`.
 */
export interface RawInsignSession {
  sessionid?: string | null
  displayname?: string | null
  displaycustomer?: string | null
  tan?: string | null
  userid?: string | null
  fullName?: string | null
  modifiedTimestamp?: number | null
  sucessfullyCompleted?: boolean | null
  // from /get/checkstatus
  status?: string | null
  processStep?: string | null
  completed?: boolean | null
  extern?: boolean | null
  gdprDeclined?: boolean | null
  dsgvoDeclined?: boolean | null
  numberOfSignaturesNeeded?: number | null
  numberOfSignaturesNeededDone?: number | null
  documentData?: RawInsignDocument[] | null
  signaturFieldsStatusList?: RawInsignSignatureField[] | null
  [key: string]: unknown
}

function mapStatus(raw: RawInsignSession): EnvelopeStatus {
  if (raw.completed === true || raw.sucessfullyCompleted === true) return 'completed'
  if (raw.gdprDeclined === true || raw.dsgvoDeclined === true) return 'declined'
  const status = (raw.status ?? '').toLowerCase()
  const step = (raw.processStep ?? '').toLowerCase()
  if (status.includes('complete')) return 'completed'
  if (status.includes('reject') || status.includes('declin')) return 'declined'
  if (status.includes('abort') || status.includes('cancel')) return 'voided'
  if (status.includes('expire')) return 'expired'
  // Once handed to external signers the session is "sent"; before that it is
  // still being configured.
  if (raw.extern === true || step === 'extern' || step === 'signing') return 'sent'
  if (step === 'configured' || step === 'created' || status === 'incomplete') return 'draft'
  return 'draft'
}

export function transformEnvelope(raw: RawInsignSession, sessionId: string): Envelope {
  const id = pickStr(raw.sessionid) ?? sessionId
  const documentIds = (raw.documentData ?? [])
    .map((d) => pickStr(d.docid))
    .filter((x): x is string => !!x)
  const signerRoles = Array.from(
    new Set(
      (raw.signaturFieldsStatusList ?? [])
        .map((f) => pickStr(f.role))
        .filter((x): x is string => !!x),
    ),
  )
  return {
    id,
    externalId: id,
    status: mapStatus(raw),
    subject: pickStr(raw.displayname) ?? '',
    senderId: pickStr(raw.userid),
    senderName: pickStr(raw.fullName),
    signingOrder: 'parallel',
    signerIds: signerRoles.map((role) => `${id}:${role}`),
    documentIds,
    updatedAt: toIso(raw.modifiedTimestamp),
    completedAt: raw.completed === true ? toIso(raw.modifiedTimestamp) : undefined,
    platform: 'insign',
    metadata: strMap({
      tan: raw.tan,
      processStep: raw.processStep,
      status: raw.status,
      customer: raw.displaycustomer,
      signaturesNeeded: raw.numberOfSignaturesNeeded,
      signaturesDone: raw.numberOfSignaturesNeededDone,
    }),
    raw,
  }
}
