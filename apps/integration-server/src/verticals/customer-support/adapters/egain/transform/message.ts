/**
 * Transform an eGain Activity (message) from the Interaction REST API into
 * the canonical OpenSteward Message schema.
 *
 * eGain Activity endpoint: GET /ws/v12/interaction/activity?case={caseId}
 * Activity schema documented at:
 *   https://hd.egain.com/api/authoring_interaction_api_reference/html/db/d0b/
 *   classcom_1_1egain_1_1bindings_1_1ws_1_1model_1_1v15_1_1gen_1_1interaction_1_1activity_1_1_activity.html
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw eGain activity object returned by GET /ws/v12/interaction/activity.
 *
 * The `payload` field contains channel-specific data (email body, chat
 * transcript, etc.) and is intentionally omitted from the canonical Message
 * per the schema-firewall (no attachment content, no voice transcripts).
 */
export interface RawEgainActivity {
  id: number | string
  type?: {
    value?: string
    displayValue?: string
  }
  subject?: string
  status?: {
    value?: string
    displayValue?: string
  }
  created?: {
    date?: string
    user?: {
      id?: number | string
      name?: string
      firstName?: string
      lastName?: string
    }
  }
  lastModified?: {
    date?: string
  }
  customer?: {
    id?: number | string
    customerName?: string
  }
  userLastWorked?: {
    id?: number | string
    name?: string
  }
  department?: {
    id?: number | string
    name?: string
  }
  case?: {
    id?: number | string
    status?: { value?: string }
  }
  mode?: {
    value?: string
    displayValue?: string
  }
  priority?: string
  isRead?: boolean
  /** Channel-specific payload — excluded per schema-firewall. */
  payload?: unknown
  link?: unknown
  [key: string]: unknown
}

/** Map an eGain activity type value to canonical MessageType. */
function mapMessageType(typeValue: string | undefined): MessageType {
  const lower = (typeValue ?? '').toLowerCase()
  if (lower === 'note' || lower === 'task') return 'internal'
  return 'public'
}

export function transformMessage(raw: RawEgainActivity, ticketId: string): Message {
  const type = mapMessageType(raw.type?.value)
  const authorType: AuthorType = 'user'
  const createdUser = raw.created?.user
  const authorId = createdUser?.id
    ? String(createdUser.id)
    : raw.customer?.id
      ? String(raw.customer.id)
      : ''

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId,
    authorType,
    // Schema-firewall: full email/chat body is excluded; use subject as body.
    body: pickStr(raw.subject) ?? '',
    type,
    createdAt: toIso(raw.created?.date) ?? new Date(0).toISOString(),
    platform: 'egain',
    metadata: strMap({
      activityType: raw.type?.value,
      activityTypeDisplay: raw.type?.displayValue,
      statusValue: raw.status?.value,
      mode: raw.mode?.value,
      priority: raw.priority,
      departmentName: raw.department?.name,
      agentName: raw.userLastWorked?.name,
    }),
    raw,
  }
}
