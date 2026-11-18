/**
 * Goodflag Signature `Workflow` (parapheur) → canonical `Envelope`.
 *
 * Fields are the documented `Workflow` type of `GET /api/workflows` and
 * `GET /api/workflows/{workflowId}`
 * (https://docs.goodflag.com/wm/api-reference/documentation-api/token-portail/workflows/search-workflows.md).
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { fullName, msToIso, str } from './shared'
import { signerIdOf } from './signer'

export interface RawGoodflagRecipient {
  consentPageId: string
  email: string
  firstName: string
  lastName: string
  country: string
  userId?: string
  pictureResourceId?: string
  phoneNumber?: string
  comments?: string
  organizationId?: string
  preferredLocale?: string
}

export interface RawGoodflagStep {
  stepType: 'approval' | 'signature'
  id: string
  recipients: RawGoodflagRecipient[]
  requiredRecipients: number
  validityPeriod: number
  invitePeriod: number
  maxInvites: number
  sendDownloadLink: boolean
  isStarted: boolean
  isFinished: boolean
  [key: string]: unknown
}

export type GoodflagWorkflowStatus = 'draft' | 'started' | 'stopped' | 'finished' | 'archived'

export interface RawGoodflagWorkflow {
  workflowMode: 'FULL' | 'SINGLE_SIGNER'
  steps: RawGoodflagStep[]
  created: number
  currentRecipientEmails: unknown[]
  currentRecipientUsers: unknown[]
  email: string
  firstName: string
  groupId: string
  id: string
  lastName: string
  name: string
  progress: number
  tenantId: string
  updated: number
  userId: string
  workflowStatus: GoodflagWorkflowStatus
  description?: string
  started?: number
  stopped?: number
  finished?: number
  closed?: number
  templateId?: string
  [key: string]: unknown
}

/**
 * The documented statuses ("Cycle de vie & statuts",
 * https://docs.goodflag.com/wm/guides/integration/creer-un-parapheur.md):
 * `draft` "rien n'est envoyé"; `started` "la première étape est lancée, les
 * invitations partent"; `finished` "toutes les étapes ont été accomplies";
 * `archived` is reached only by "Clôturer (`finished` → `archived`)".
 * `stopped` is only "le parapheur a été interrompu", which names neither a
 * refusal nor a cancellation, so it maps to `unknown`.
 */
function mapStatus(s: GoodflagWorkflowStatus): EnvelopeStatus {
  switch (s) {
    case 'draft':
      return 'draft'
    case 'started':
      return 'sent'
    case 'finished':
    case 'archived':
      return 'completed'
    default:
      return 'unknown'
  }
}

export function transformEnvelope(raw: RawGoodflagWorkflow): Envelope {
  const steps = raw.steps ?? []
  const metadata: Record<string, string> = {
    workflowMode: raw.workflowMode,
    workflowStatus: raw.workflowStatus,
    progress: String(raw.progress),
    groupId: raw.groupId,
    tenantId: raw.tenantId,
  }
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.workflowStatus),
    subject: raw.name,
    message: str(raw.description),
    senderId: str(raw.userId),
    senderEmail: str(raw.email),
    senderName: fullName(raw.firstName, raw.lastName),
    // "Un parapheur est composé d'étapes (steps), jouées séquentiellement.
    // Chaque étape réunit un ou plusieurs destinataires (recipients) qui
    // agissent, eux, en parallèle." (creer-un-parapheur.md)
    signingOrder: steps.length > 1 ? 'sequential' : 'parallel',
    signerIds: steps.flatMap((step) => step.recipients.map((r) => signerIdOf(step, r))),
    // A Workflow carries no documents; they are searched separately
    // (GET /api/documents?items.workflowId=…), see listDocuments.
    documentIds: [],
    templateId: str(raw.templateId),
    createdAt: msToIso(raw.created),
    sentAt: msToIso(raw.started),
    completedAt: msToIso(raw.finished),
    updatedAt: msToIso(raw.updated),
    platform: 'lex-persona',
    metadata,
    raw,
  }
}
