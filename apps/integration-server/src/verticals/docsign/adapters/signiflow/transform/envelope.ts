import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * A SigniFlow signing job is a *document* carrying a *workflow* of worksteps.
 * The document is the canonical Envelope; its worksteps are the Signers. The
 * raw document content (`Document`, base64) is never read — only metadata.
 */
export interface RawSigniFlowWorkStep {
  WorkStepID?: number | string
  StepID?: number | string
  WorkStepNumber?: number | string
  StepOrder?: number | string
  EmailAddress?: string
  Email?: string
  FullName?: string
  FirstName?: string
  LastName?: string
  MobileNumber?: string
  WorkStepStatus?: string
  Status?: string
  Action?: string
  SignatureType?: string
  SignReason?: string
  DateSigned?: string
  SignedDate?: string
  DateViewed?: string
  DateSent?: string
  DeclineReason?: string
  [key: string]: unknown
}

export interface RawSigniFlowDocument {
  DocID?: number | string
  DocumentID?: number | string
  DocumentId?: number | string
  DocName?: string
  DocumentName?: string
  DocExtension?: string
  DocumentExtension?: string
  WorkflowStatus?: string
  DocStatus?: string
  Status?: string
  Subject?: string
  Message?: string
  OwnerEmail?: string
  OwnerName?: string
  OwnerUserID?: number | string
  TemplateID?: number | string
  DateCreated?: string
  DateSent?: string
  DateCompleted?: string
  DateDeclined?: string
  DateCancelled?: string
  DateVoided?: string
  ExpiryDate?: string
  DateModified?: string
  WorkSteps?: RawSigniFlowWorkStep[]
  Workflow?: RawSigniFlowWorkStep[]
  [key: string]: unknown
}

export function documentId(raw: RawSigniFlowDocument): string {
  return String(raw.DocID ?? raw.DocumentID ?? raw.DocumentId ?? '')
}

function workSteps(raw: RawSigniFlowDocument): RawSigniFlowWorkStep[] {
  return raw.WorkSteps ?? raw.Workflow ?? []
}

function stepOrder(w: RawSigniFlowWorkStep): number {
  const n = Number(w.WorkStepNumber ?? w.StepOrder ?? 0)
  return Number.isNaN(n) ? 0 : n
}

export function workStepId(w: RawSigniFlowWorkStep, envelopeId: string, index: number): string {
  const native = w.WorkStepID ?? w.StepID
  return native != null && native !== '' ? String(native) : `${envelopeId}:${index}`
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s.includes('complet') || s.includes('signed') || s.includes('finish')) return 'completed'
  if (s.includes('declin') || s.includes('reject')) return 'declined'
  if (s.includes('cancel') || s.includes('void') || s.includes('remov')) return 'voided'
  if (s.includes('expir')) return 'expired'
  if (s.includes('deliver') || s.includes('view')) return 'delivered'
  if (s.includes('progress') || s.includes('pending') || s.includes('sent') || s.includes('action'))
    return 'sent'
  if (s.includes('draft') || s.includes('prep') || s.includes('creat')) return 'draft'
  return 'draft'
}

function signingOrder(steps: RawSigniFlowWorkStep[]): 'parallel' | 'sequential' {
  const orders = steps.map(stepOrder)
  if (orders.length === 0) return 'parallel'
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawSigniFlowDocument): Envelope {
  const id = documentId(raw)
  const steps = [...workSteps(raw)].sort((a, b) => stepOrder(a) - stepOrder(b))
  const name = pickStr(raw.DocName ?? raw.DocumentName)
  return {
    id,
    externalId: id,
    status: mapStatus(raw.WorkflowStatus ?? raw.DocStatus ?? raw.Status),
    subject: pickStr(raw.Subject ?? raw.DocName ?? raw.DocumentName) ?? '',
    message: pickStr(raw.Message),
    senderId: pickStr(raw.OwnerUserID),
    senderEmail: pickStr(raw.OwnerEmail),
    senderName: pickStr(raw.OwnerName),
    signingOrder: signingOrder(steps),
    signerIds: steps.map((w, i) => workStepId(w, id, i)),
    documentIds: id ? [id] : [],
    templateId: pickStr(raw.TemplateID),
    createdAt: toIso(raw.DateCreated),
    sentAt: toIso(raw.DateSent),
    completedAt: toIso(raw.DateCompleted),
    declinedAt: toIso(raw.DateDeclined),
    voidedAt: toIso(raw.DateCancelled ?? raw.DateVoided),
    expiresAt: toIso(raw.ExpiryDate),
    updatedAt: toIso(raw.DateModified),
    platform: 'signiflow',
    metadata: strMap({
      docName: name,
      docExtension: raw.DocExtension ?? raw.DocumentExtension,
      workflowStatus: raw.WorkflowStatus ?? raw.DocStatus ?? raw.Status,
    }),
    raw,
  }
}
