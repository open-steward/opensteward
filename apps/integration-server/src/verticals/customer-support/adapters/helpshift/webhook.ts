/**
 * Helpshift webhook parsing.
 *
 * Helpshift webhooks are configured in the dashboard with optional Basic Auth
 * or a custom secret key sent as a header. Helpshift does NOT document a
 * standard HMAC-based cryptographic signature header, so verifyWebhook
 * always returns true (verification is expected to be handled at the network
 * or infra level, e.g. IP allowlist or mTLS).
 *
 * Event types from sample payloads (github.com/helpshift/helpshift-webhooks-examples):
 *   create_issue                        — new issue created
 *   update_issue                        — issue status/assignee updated
 *   add_message_with_attachment_event   — message with attachment added
 *   add_note_event                      — internal note added
 *   add_csat_event                      — CSAT rating added
 *   change_queue_assigned_issue_event   — queue assignment changed
 *   change_queue_unassigned_issue_event — queue unassignment
 *   tag_added_event                     — tag applied
 *   tag_removed_event                   — tag removed
 *
 * Payload envelope:
 *   event_type       — string event type
 *   event_id         — UUID
 *   event_timestamp  — Unix ms
 *   data             — issue data object
 *     id             — numeric issue ID
 *     state_data     — { state, changed_at }
 *     messages       — array of messages (for create_issue)
 *     updates        — updated fields (for update_issue)
 *
 * Docs: https://developers.helpshift.com/rest-api/
 */
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  create_issue: { resourceType: 'tickets', action: 'created' },
  update_issue: { resourceType: 'tickets', action: 'updated' },
  issue_status_change: { resourceType: 'tickets', action: 'updated' },
  issue_assignee_and_status_change: { resourceType: 'tickets', action: 'updated' },
  add_message: { resourceType: 'messages', action: 'commented' },
  add_message_with_attachment_event: { resourceType: 'messages', action: 'commented' },
  add_note_event: { resourceType: 'messages', action: 'commented' },
  add_csat_event: { resourceType: 'tickets', action: 'rated' },
  change_queue_assigned_issue_event: { resourceType: 'tickets', action: 'assigned' },
  change_queue_unassigned_issue_event: { resourceType: 'tickets', action: 'unassigned' },
  unassign_issue: { resourceType: 'tickets', action: 'unassigned' },
  tag_added_event: { resourceType: 'tags', action: 'updated' },
  tag_removed_event: { resourceType: 'tags', action: 'updated' },
}

export function verifyHelpshiftWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Helpshift does not publish a standard HMAC signature header.
  // Verification is handled via dashboard auth settings (Basic / custom key header)
  // at the infrastructure layer; always return true here.
  return true
}

export function parseHelpshiftWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? '')
  const eventId = String(payload['event_id'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const issueId = String(data['id'] ?? '')
  const mapped = EVENT_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const isMessage =
    mapped.resourceType === 'messages' ||
    eventType === 'add_note_event' ||
    eventType.startsWith('add_message')

  return [
    {
      id: eventId || `helpshift:${eventType}:${issueId}`,
      platform: 'helpshift',
      type: eventType,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId: issueId,
      ticketId: isMessage ? issueId : undefined,
      payload,
    },
  ]
}

export const helpshiftWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyHelpshiftWebhook,
  parseWebhookEvents: parseHelpshiftWebhookEvents,
}
