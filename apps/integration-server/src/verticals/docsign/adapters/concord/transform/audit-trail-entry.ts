/**
 * Concord audit activity -> canonical AuditTrailEntry.
 *
 * GET /organizations/{organizationId}/agreements/{agreementUid}/activities
 * with the required `type=AUDIT` answers GetActivitiesAuditResponse
 * `{ activities: ActivityAudit[] }`
 * (https://api.doc.concordnow.com/concord-openapi-bundled.yaml). ActivityAudit:
 *   required: id, organization, createdAt, action, status, params,
 *   userOrganization, visibility
 *   createdAt: integer int64; userOrganization.user: ActivityUser {id, email, name}
 *
 * `action` is a documented enum ("Audit trail action"); each value below is
 * mapped by its documented description, and every other value is 'other'.
 * The action code itself is the description.
 */
import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { msToIso, requireStr, strMap } from './shared'

export interface RawConcordActivityAudit {
  id: string
  createdAt: number
  action: string
  status?: string
  params?: string
  visibility?: string
  organization?: { id?: number; name?: string }
  userOrganization?: {
    id?: number
    job?: string
    user?: { id?: number; email?: string; name?: string }
    organization?: { id?: number; name?: string }
  }
  [key: string]: unknown
}

const EVENT_TYPES: Record<string, AuditTrailEventType> = {
  // "User created draft" / "User created document in review" / "User created template" / "User added the contract"
  DRAFT_CREATE: 'created',
  NEGOTIATION_CREATE: 'created',
  TEMPLATE_CREATE: 'created',
  CONTRACT_ADD: 'created',
  // "User sent a request for signature to" / "User has triggered auto-request for signature to"
  AGREEMENT_SIGNATURE_REQUIRE: 'sent',
  AGREEMENT_SIGNATURE_REQUIRE_AUTO: 'sent',
  // "User read the contract" / "User read the contract by downloading it from the invitation"
  AGREEMENT_VIEW: 'viewed',
  AGREEMENT_OPENED_DOWNLOAD_LINK: 'viewed',
  // "User signed the contract" / "User signed using double authentication"
  NEGOTIATION_APPROVE: 'signed',
  AGREEMENT_SIGNING_AUTHENTICATION: 'signed',
  // "User finalized document signatures" / "Document has been completed on Docusign"
  AGREEMENT_SIGNATURE_FINALIZE: 'completed',
  AGREEMENT_DOCUSIGN_COMPLETED: 'completed',
  // "OTP was verified for the guest"
  AGREEMENT_OTP_VERIFIED: 'authenticated',
  // "User invited an invalid email"
  INVITATION_BOUNCED: 'delivery_failed',
}

export function mapAuditAction(action: string): AuditTrailEventType {
  return EVENT_TYPES[action] ?? 'other'
}

/** Entry ids are `<agreementUid>:<activity id>`, so one can be read back by id. */
export function auditEntryId(envelopeId: string, activityId: string): string {
  return `${envelopeId}:${activityId}`
}

export function transformAuditTrailEntry(
  raw: RawConcordActivityAudit,
  envelopeId: string,
): AuditTrailEntry {
  const activityId = requireStr(raw.id, `activity on ${envelopeId} id`)
  const action = requireStr(raw.action, `activity ${activityId} action`)
  const occurredAt = msToIso(raw.createdAt)
  if (!occurredAt) throw new Error(`concord activity ${activityId} has no createdAt`)
  const user = raw.userOrganization?.user
  const id = auditEntryId(envelopeId, activityId)
  return {
    id,
    externalId: activityId,
    envelopeId,
    occurredAt,
    eventType: mapAuditAction(action),
    description: action,
    actorId: typeof user?.id === 'number' ? String(user.id) : undefined,
    actorEmail: user?.email || undefined,
    actorName: user?.name || undefined,
    platform: 'concord',
    metadata: strMap({
      agreementStatus: raw.status,
      visibility: raw.visibility,
      params: raw.params,
      organization: raw.organization?.name,
    }),
    raw,
  }
}
