import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Signicat signing session is the canonical "envelope": it ties one or
 * more documents (referenced by `documentId` within a document collection)
 * to a signing flow. There is no platform-level sender; the operator's API
 * client owns every session.
 */
export interface RawSignicatSigningSession {
  id: string
  title?: string
  externalReference?: string
  dueDate?: string
  createdAt?: string
  updatedAt?: string
  documents?: Array<{
    documentCollectionId?: string
    documentId?: string
    action?: string
    description?: string
  }>
  lifecycle?: {
    state?: string
    stateIsFinal?: boolean
    error?: unknown
  }
  signatureUrl?: string
  signingSetup?: Array<{
    identityProviders?: Array<{ idpName?: string }>
    signingFlow?: string
    additionalParameters?: Record<string, unknown>
  }>
  output?: {
    signatures?: Array<{
      resultDocumentId?: string
      originalDocumentId?: string
      signatureType?: string
    }>
    packages?: Array<{
      packageId?: string
      resultDocumentId?: string
      packageType?: string
    }>
  }
  packageTo?: string[]
  [key: string]: unknown
}

/**
 * Signicat lifecycle states → canonical EnvelopeStatus.
 *   READY        — created, awaiting signing            → sent
 *   IN_PROGRESS  — signer is mid-flow                   → delivered
 *   SIGNED       — all required signatures collected    → completed
 *   CANCELLED    — deleted/cancelled                    → voided
 *   REJECTED     — signer declined                      → declined
 *   EXPIRED      — past the due date                    → expired
 *   FAILED/ERROR — terminal error                       → voided
 */
function mapStatus(state: string | undefined): EnvelopeStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'CREATED':
    case 'DRAFT':
      return 'draft'
    case 'READY':
      return 'sent'
    case 'IN_PROGRESS':
    case 'STARTED':
      return 'delivered'
    case 'SIGNED':
    case 'COMPLETED':
      return 'completed'
    case 'REJECTED':
    case 'DECLINED':
      return 'declined'
    case 'CANCELLED':
    case 'CANCELED':
    case 'FAILED':
    case 'ERROR':
      return 'voided'
    case 'EXPIRED':
      return 'expired'
    default:
      return 'sent'
  }
}

function documentIds(raw: RawSignicatSigningSession): string[] {
  return (raw.documents ?? [])
    .map((d) => pickStr(d.documentId))
    .filter((id): id is string => typeof id === 'string')
}

export function transformEnvelope(raw: RawSignicatSigningSession): Envelope {
  const state = raw.lifecycle?.state
  const status = mapStatus(state)
  const signerIds = (raw.signingSetup ?? []).map((_, i) => `${raw.id}:${i}`)
  const errorStr =
    raw.lifecycle?.error != null && typeof raw.lifecycle.error !== 'object'
      ? String(raw.lifecycle.error)
      : undefined

  return {
    id: raw.id,
    externalId: pickStr(raw.externalReference) ?? raw.id,
    status,
    subject: pickStr(raw.title) ?? '',
    message: undefined,
    senderId: undefined,
    senderEmail: undefined,
    senderName: undefined,
    // Each signing setup is signed independently; treat multi-setup as parallel.
    signingOrder: 'parallel',
    signerIds,
    documentIds: documentIds(raw),
    templateId: undefined,
    createdAt: toIso(raw.createdAt),
    sentAt: status === 'sent' ? toIso(raw.createdAt) : undefined,
    deliveredAt: undefined,
    completedAt: status === 'completed' ? toIso(raw.updatedAt) : undefined,
    declinedAt: status === 'declined' ? toIso(raw.updatedAt) : undefined,
    voidedAt: status === 'voided' ? toIso(raw.updatedAt) : undefined,
    expiresAt: toIso(raw.dueDate),
    updatedAt: toIso(raw.updatedAt),
    platform: 'signicat',
    metadata: strMap({
      lifecycleState: state,
      stateIsFinal: raw.lifecycle?.stateIsFinal,
      lifecycleError: errorStr,
      signatureUrl: raw.signatureUrl,
      packageTo: (raw.packageTo ?? []).join(','),
      resultPackageId: raw.output?.packages?.[0]?.resultDocumentId,
    }),
    raw,
  }
}
