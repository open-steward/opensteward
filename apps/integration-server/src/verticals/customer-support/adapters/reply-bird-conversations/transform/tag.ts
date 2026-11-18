/**
 * Bird mailbox label → canonical Tag.
 *
 * `GET /v1/email/mailboxes/{mailbox_id}/labels`
 * (https://bird.com/docs/api/reference/list-mailbox-labels): "Returns the labels
 * available in a mailbox. First, the built-in system labels: The placements
 * `inbox`, `archive`, `spam`, `blocked`, and `sent`. `trash`. `unread`. Then,
 * every custom label currently in use on its conversations and messages."
 *
 * `EmailMailboxLabel`: `name` ("The label name, as it appears on conversations
 * and messages") and `type` (`system` | `custom`: "`custom` labels are the
 * workspace's own tags").
 *
 * Only custom labels are tags. Labels are listed per mailbox, so a tag's id is
 * `{mailbox_id}:{name}`; a ticket's `tagIds` are built the same way from its
 * `mailbox_id` and custom `labels`. A MailboxID matches `^mbx_[0-9a-hjkmnp-tv-z]{26}$`,
 * so the first `:` always ends it.
 */
import type { Tag } from '../../../schema'

export interface RawBirdLabel {
  name: string
  type: 'system' | 'custom'
}

/** The built-in system labels named by the list-mailbox-labels reference. */
const SYSTEM_LABELS = new Set(['inbox', 'archive', 'spam', 'blocked', 'sent', 'trash', 'unread'])

/** The custom labels in a conversation's or message's `labels`. */
export function customLabels(labels: readonly string[]): string[] {
  return labels.filter((l) => !SYSTEM_LABELS.has(l))
}

export function labelTagId(mailboxId: string, name: string): string {
  return `${mailboxId}:${name}`
}

/** Splits a tag id back into its mailbox id and label name, or undefined when it has no `mbx_…:` prefix. */
export function parseLabelTagId(id: string): { mailboxId: string; name: string } | undefined {
  const at = id.indexOf(':')
  if (at < 0) return undefined
  const mailboxId = id.slice(0, at)
  const name = id.slice(at + 1)
  if (!mailboxId.startsWith('mbx_') || !name) return undefined
  return { mailboxId, name }
}

export function transformTag(mailboxId: string, raw: RawBirdLabel): Tag {
  const id = labelTagId(mailboxId, raw.name)
  return {
    id,
    externalId: id,
    name: raw.name,
    platform: 'reply-bird-conversations',
    metadata: { mailboxId },
    raw,
  }
}
