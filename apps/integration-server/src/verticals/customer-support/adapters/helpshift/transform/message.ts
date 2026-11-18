/**
 * Helpshift message transform.
 *
 * Messages are inline on the issue returned by GET /{domain}/issues/{issue-id}
 * (https://developers.helpshift.com/rest-api/scenarios/). The documented
 * sample message carries only:
 *   body       — message text/HTML
 *   created_at — Unix timestamp in milliseconds
 *   author     — { name, id, emails[] }
 * Helpshift's own export sample
 * (github.com/helpshift/helpshift-api samples/python/export_issues_to_csv.py)
 * also reads `origin` ('end-user' = inbound, 'helpshift' = outbound) and an
 * optional `attachment` object with `file_name`. Only 'end-user' maps to an
 * author type: the same sample says "Outbound Messages counts include agents
 * and automation messages counts", so 'helpshift' does not say whether the
 * author is an agent or a bot, and stays 'unknown' (the origin is kept in
 * metadata).
 *
 * No message id is documented, so the id is built from documented fields:
 * `<issue id>:<created_at>:<author.id>`. Known limitation: two messages by the
 * same author in the same millisecond would share an id. Whether a message is
 * public or a private note is not documented on this payload, so `type` is
 * 'unknown'.
 */
import type { Message, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawHelpshiftMessage {
  body?: string
  created_at?: number
  origin?: string
  author?: {
    id?: string
    name?: string
    emails?: string[]
  }
  attachment?: {
    file_name?: string
  }
  [key: string]: unknown
}

function mapOrigin(origin: string | undefined): AuthorType {
  if (origin === 'end-user') return 'contact'
  return 'unknown'
}

export function transformMessage(raw: RawHelpshiftMessage, ticketId: string): Message {
  const createdAt = toIso(raw.created_at)
  if (createdAt === undefined)
    throw new Error(`Helpshift message on issue ${ticketId} has no created_at`)
  const authorId = pickStr(raw.author?.id)
  if (authorId === undefined)
    throw new Error(`Helpshift message on issue ${ticketId} has no author.id`)
  const id = `${ticketId}:${String(raw.created_at)}:${authorId}`

  return {
    id,
    externalId: id,
    ticketId,
    authorId,
    authorType: mapOrigin(raw.origin),
    body: pickStr(raw.body) ?? '',
    type: 'unknown',
    attachmentCount: raw.attachment ? 1 : 0,
    createdAt,
    platform: 'helpshift',
    metadata: strMap({
      origin: raw.origin,
      authorName: raw.author?.name,
    }),
    raw,
  }
}
