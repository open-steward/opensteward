/**
 * FreeScout thread -> canonical Message transform.
 *
 * FreeScout calls individual messages "threads" (nested inside conversations).
 * Thread types: customer | message (agent reply) | note (internal).
 * The `createdBy` object contains the author id; `type` field identifies
 * whether the author is a customer or agent.
 * Attachments are listed under `attachments[]` — we surface the count only.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFreescoutThread {
  id: number
  type?: string        // 'customer' | 'message' | 'note' | 'lineitem' | 'phone'
  status?: string
  text?: string
  source?: { type?: string; via?: string } | null
  customer?: { id?: number } | null
  createdBy?: { id?: number; type?: string } | null
  assignedTo?: { id?: number } | null
  attachments?: Array<{ id?: number; fileName?: string }> | null
  createdAt?: string
  openedAt?: string | null
  [key: string]: unknown
}

function mapMessageType(t: string | undefined): MessageType {
  if (t === 'note') return 'internal'
  return 'public'
}

function mapAuthorType(t: string | undefined): AuthorType {
  if (t === 'customer') return 'contact'
  if (t === 'message') return 'user'
  if (t === 'note') return 'user'
  return 'system'
}

function resolveAuthorId(raw: RawFreescoutThread): string {
  // For customer threads the author is raw.customer.id; for agent threads it is raw.createdBy.id
  if (raw.type === 'customer') {
    return raw.customer?.id != null ? String(raw.customer.id) : ''
  }
  return raw.createdBy?.id != null ? String(raw.createdBy.id) : ''
}

export function transformMessage(raw: RawFreescoutThread, ticketId: string): Message {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: resolveAuthorId(raw),
    authorType: mapAuthorType(raw.type),
    body: pickStr(raw.text) ?? '',
    type: mapMessageType(raw.type),
    attachmentCount: Array.isArray(raw.attachments) ? raw.attachments.length : undefined,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    platform: 'freescout',
    metadata: strMap({ rawType: raw.type }),
    raw,
  }
}
