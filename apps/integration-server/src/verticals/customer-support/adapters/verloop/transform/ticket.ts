/**
 * Transform a Verloop Campaign record into the canonical Ticket shape.
 *
 * Verloop campaigns represent outreach/messaging threads. Each campaign has a
 * lifecycle status (DRAFT, SCHEDULED, ACTIVE, PAUSED, COMPLETED, FAILED) that
 * maps to the canonical TicketStatus. Campaigns are outbound WhatsApp/voice
 * campaigns — the channel maps accordingly.
 *
 * API response shape reference:
 *   POST https://<client_id>.verloop.io/api/v1/Campaign/ListCampaigns
 *   POST https://<client_id>.verloop.io/api/v1/Campaign/GetCampaign
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawVerloopCampaignMeta {
  Id?: string
  CreatedAt?: number
  UpdatedAt?: number
}

export interface RawVerloopCampaign {
  Meta?: RawVerloopCampaignMeta
  Name?: string
  Status?: string
  Channel?: string
  RecipeId?: string
  PhoneIntegrationId?: string
  TriggerType?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  // Verloop Campaign API returns status values with a "STATUS_" prefix
  // (e.g. "STATUS_DRAFT", "STATUS_PUBLISHED"). Strip the prefix so both
  // prefixed and un-prefixed values resolve correctly.
  const normalised = (s ?? '').toUpperCase().replace(/^STATUS_/, '')
  switch (normalised) {
    case 'PUBLISHED':
    case 'ACTIVE':
    case 'SCHEDULED':
      return 'open'
    case 'PAUSED':
      return 'on_hold'
    case 'COMPLETED':
    case 'SENT':
    case 'DELIVERED':
    case 'READ':
    case 'REPLIED':
      return 'resolved'
    case 'FAILED':
    case 'EXPIRED':
      return 'closed'
    case 'DRAFT':
    case 'PENDING':
    default:
      return 'pending'
  }
}

function mapChannel(c: string | undefined): Channel {
  switch ((c ?? '').toUpperCase()) {
    case 'WHATSAPP':
    case 'WABA':
      return 'chat'
    case 'VOICE':
      return 'voice'
    case 'SMS':
      return 'sms'
    default:
      return 'other'
  }
}

export function transformTicket(raw: RawVerloopCampaign): Ticket {
  const id = pickStr(raw.Meta?.Id) ?? ''
  const status = mapStatus(raw.Status)
  const createdAt = toIso(raw.Meta?.CreatedAt) ?? new Date(0).toISOString()
  const updatedAt = toIso(raw.Meta?.UpdatedAt)

  return {
    id,
    externalId: id,
    subject: pickStr(raw.Name) ?? '',
    status,
    channel: mapChannel(raw.Channel),
    requesterId: '',
    tagIds: [],
    createdAt,
    updatedAt,
    // resolvedAt is set only for the 'resolved' canonical status. 'closed'
    // campaigns (FAILED/EXPIRED) do not get resolvedAt because they never
    // reached a successful completion state.
    resolvedAt: status === 'resolved' ? updatedAt : undefined,
    // closedAt is intentionally omitted: the Verloop Campaign API does not
    // expose a distinct closed_at timestamp — there is no separate field for
    // when a campaign transitioned to a terminal failure/expiry state.
    platform: 'verloop',
    metadata: strMap({
      triggerType: raw.TriggerType,
      recipeId: raw.RecipeId,
      phoneIntegrationId: raw.PhoneIntegrationId,
      rawStatus: raw.Status,
      rawChannel: raw.Channel,
    }),
    raw,
  }
}
