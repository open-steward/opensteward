/**
 * PandaDoc audit-trail entry → canonical AuditTrailEntry.
 *
 * Source: `GET /public/v2/documents/{document_id}/audit-trail`, whose
 * `results[]` items document exactly `id`, `user { id, email }`, `action`
 * (an integer code), `reason`, `date_created` and `ip_address`.
 * https://developers.pandadoc.com/reference/list-document-audit-trail
 */
import type {
  AuditTrailEntry,
  AuditTrailEventType,
} from '../../../schema/audit-trail-entry'
import { pickStr, toIso } from './shared'

export interface RawPandaDocAuditTrailEntry {
  id?: string
  user?: { id?: string; email?: string }
  action?: number
  reason?: string | null
  date_created?: string
  ip_address?: string | null
  [key: string]: unknown
}

/**
 * The documented "String Representation" of each `action` code, verbatim
 * from the endpoint's `action` description table.
 */
const ACTION_LABELS: Readonly<Record<number, string>> = {
  1: 'new document',
  2: 'new revision',
  3: 'approval request',
  4: 'approved',
  5: 'rejected',
  6: 'sent',
  7: 'completed by all',
  8: 'viewed',
  9: 'completed',
  10: 'waiting pay',
  11: 'paid',
  12: 'forwarded',
  13: 'expired',
  14: 'bank account submitted',
  15: 'bank account verified',
  16: 'payment submitted',
  17: 'payment failed',
  18: 'completed manually',
  19: 'expired manually',
  20: 'paid manually',
  21: 'approval deleted',
  22: 'approval forced',
  23: 'reassigned',
  24: 'recipient edited',
  25: 'recipient added',
  26: 'recipient deleted',
  27: 'declined manually',
  28: 'approval step skipped',
  29: 'suggest edits',
  43: 'declined',
  44: 'partly paid',
  45: 'partly paid manually',
  47: 'recipient verification with kba passed',
  48: 'recipient verification with id passed',
  49: 'recipient verification with text sms passed',
  50: 'recipient verification with passcode passed',
  51: 'recipient verification with kba failed',
  52: 'recipient verification with id failed',
  53: 'recipient verification with text sms failed',
  54: 'recipient verification with passcode failed',
  55: 'recipient signed with QES',
  56: 'QES completed',
  57: 'recipient QES attempt started',
  58: 'recipient QES attempt expired',
  59: 'Optional item in quote selected',
  60: 'Optional item in quote deselected',
  61: 'Item quantity in quote changed',
  62: 'Item quantity in pricing table changed',
  63: 'Optional item in pricing table selected',
  64: 'Optional item in pricing table deselected',
  65: 'Section item in pricing table selected (one of)',
  66: 'Optional section in quote selected',
  67: 'Optional section in quote deselected',
  68: 'Section quantity in quote changed',
  69: 'recipient verification with email otp passed',
  70: 'recipient verification with email otp failed',
}

/** Codes with a canonical counterpart; every other documented code is `other`. */
const ACTION_EVENT_TYPES: Readonly<Record<number, AuditTrailEventType>> = {
  1: 'created',
  6: 'sent',
  7: 'completed',
  8: 'viewed',
  9: 'signed',
  13: 'expired',
  19: 'expired',
  23: 'reassigned',
  27: 'declined',
  43: 'declined',
  47: 'authenticated',
  48: 'authenticated',
  49: 'authenticated',
  50: 'authenticated',
  55: 'signed',
  69: 'authenticated',
}

/** "If a sandbox API key is used, this will be \"hidden\"." — not an address. */
const HIDDEN_IP = 'hidden'

/**
 * `id` is `<envelopeId>:<entry id>` so {@link PandaDocAdapter.getAuditTrailEntry}
 * can find the document whose trail to read; `externalId` is PandaDoc's own id.
 */
export function transformAuditTrailEntry(
  raw: RawPandaDocAuditTrailEntry,
  envelopeId: string,
): AuditTrailEntry {
  const entryId = pickStr(raw.id)
  if (!entryId) throw new Error('PandaDoc audit-trail entry has no id')
  const occurredAt = toIso(raw.date_created)
  if (!occurredAt) throw new Error(`PandaDoc audit-trail entry ${entryId} has no date_created`)
  if (typeof raw.action !== 'number') {
    throw new Error(`PandaDoc audit-trail entry ${entryId} has no action code`)
  }
  const action = raw.action
  const reason = pickStr(raw.reason)
  const ip = pickStr(raw.ip_address)

  return {
    id: `${envelopeId}:${entryId}`,
    externalId: entryId,
    envelopeId,
    occurredAt,
    eventType: ACTION_EVENT_TYPES[action] ?? 'other',
    description: ACTION_LABELS[action] ?? `action ${action}`,
    actorId: pickStr(raw.user?.id),
    actorEmail: pickStr(raw.user?.email),
    actorIp: ip && ip !== HIDDEN_IP ? ip : undefined,
    platform: 'pandadoc',
    metadata: {
      action: String(action),
      ...(reason ? { reason } : {}),
    },
    raw,
  }
}
