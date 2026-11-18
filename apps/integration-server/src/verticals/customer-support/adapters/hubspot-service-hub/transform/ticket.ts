/**
 * HubSpot Service Hub ticket transform.
 *
 * HubSpot CRM tickets live at GET /crm/v3/objects/tickets.
 * All ticket data is inside a `properties` object on each record.
 * The `id` field is the HubSpot-assigned object ID (string).
 *
 * Key default properties:
 *   subject, content, hs_pipeline, hs_pipeline_stage, hs_ticket_priority,
 *   hs_ticket_category, hs_resolution, hubspot_owner_id, source_type,
 *   createdate, hs_lastmodifieddate, hs_closed_at
 *
 * Pipeline stages are numeric strings (e.g. "1" = NEW, "2" = WAITING, etc.)
 * HubSpot doesn't expose a canonical stage-name map via the ticket object;
 * we map the most common default stage IDs and fall back to "open".
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawHubspotTicketProperties {
  subject?: string | null
  content?: string | null
  hs_pipeline?: string | null
  hs_pipeline_stage?: string | null
  hs_ticket_priority?: string | null
  hs_ticket_category?: string | null
  hs_resolution?: string | null
  hubspot_owner_id?: string | null
  source_type?: string | null
  hs_ticket_id?: string | null
  createdate?: string | null
  hs_lastmodifieddate?: string | null
  hs_closed_at?: string | null
  hs_tags?: string | null
  [key: string]: unknown
}

export interface RawHubspotTicket {
  id: string
  properties: RawHubspotTicketProperties
  createdAt?: string
  updatedAt?: string
  archived?: boolean
  [key: string]: unknown
}

/**
 * HubSpot default pipeline stage IDs for the built-in support pipeline.
 * Custom pipelines will have different IDs; map conservatively.
 */
function mapStatus(stage: string | null | undefined): TicketStatus {
  if (!stage) return 'open'
  switch (stage) {
    // Default HubSpot support pipeline stages
    case '1': return 'open'       // New
    case '2': return 'pending'    // Waiting on contact
    case '3': return 'pending'    // Waiting on us
    case '4': return 'resolved'   // Closed
    default: {
      // Attempt string-based fallback for custom pipelines
      const lower = stage.toLowerCase()
      if (lower.includes('new') || lower.includes('open')) return 'open'
      if (lower.includes('wait') || lower.includes('pending')) return 'pending'
      if (lower.includes('progress') || lower.includes('in_progress')) return 'in_progress'
      if (lower.includes('hold')) return 'on_hold'
      if (lower.includes('resolv') || lower.includes('solved')) return 'resolved'
      if (lower.includes('clos')) return 'closed'
      return 'open'
    }
  }
}

function mapPriority(p: string | null | undefined): TicketPriority | undefined {
  if (!p) return undefined
  switch (p.toUpperCase()) {
    case 'LOW': return 'low'
    case 'MEDIUM':
    case 'NORMAL': return 'normal'
    case 'HIGH': return 'high'
    case 'URGENT': return 'urgent'
    default: return undefined
  }
}

function mapChannel(sourceType: string | null | undefined): Channel {
  if (!sourceType) return 'other'
  switch (sourceType.toUpperCase()) {
    case 'EMAIL': return 'email'
    case 'CHAT': return 'chat'
    case 'PHONE': return 'voice'
    case 'SOCIAL': return 'social'
    case 'WEB': return 'web'
    case 'SMS': return 'sms'
    case 'API': return 'api'
    default: return 'other'
  }
}

export function transformTicket(raw: RawHubspotTicket): Ticket {
  const props = raw.properties ?? {}
  const status = mapStatus(props.hs_pipeline_stage)
  const createdAt = toIso(props.createdate ?? raw.createdAt) ?? new Date(0).toISOString()
  const updatedAt = toIso(props.hs_lastmodifieddate ?? raw.updatedAt)
  const closedAt = toIso(props.hs_closed_at)

  // hs_tags is a semicolon-separated string in HubSpot
  const tagIds: string[] = props.hs_tags
    ? props.hs_tags.split(';').map((t) => t.trim()).filter(Boolean)
    : []

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(props.hs_ticket_id) ?? raw.id,
    subject: pickStr(props.subject) ?? '',
    status,
    priority: mapPriority(props.hs_ticket_priority),
    channel: mapChannel(props.source_type),
    requesterId: '',  // HubSpot tickets link contacts via associations, not a direct FK on the ticket
    assigneeId: pickStr(props.hubspot_owner_id),
    tagIds,
    satisfactionRating: undefined,
    createdAt,
    updatedAt,
    resolvedAt: status === 'resolved' ? (closedAt ?? updatedAt) : undefined,
    closedAt: status === 'closed' ? (closedAt ?? updatedAt) : closedAt,
    platform: 'hubspot-service-hub',
    metadata: strMap({
      pipeline: props.hs_pipeline,
      pipelineStage: props.hs_pipeline_stage,
      category: props.hs_ticket_category,
      resolution: props.hs_resolution,
      sourceType: props.source_type,
    }),
    raw,
  }
}
