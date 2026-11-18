/**
 * UVdesk saved-reply (macro) transform.
 *
 * UVdesk saved-reply wire shape (GET /{locale}/api/saved-replys.json):
 *   id, name, message, subject, companyId, templateFor, isPredefind
 *
 * UVdesk uses "saved replies" (canned response templates) rather than
 * executable macros. The body is stored in the "message" field (may be HTML).
 * The "name" field maps to our canonical "title".
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUvdeskSavedReply {
  id?: number | string
  name?: string
  message?: string
  subject?: string | null
  companyId?: number | string | null
  templateFor?: string | null
  isPredefind?: boolean
  [key: string]: unknown
}

/** Strip HTML tags from saved-reply message to produce plain-text body. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim()
}

export function transformMacro(raw: RawUvdeskSavedReply): Macro {
  const rawBody = pickStr(raw.message) ?? ''
  const body = rawBody.includes('<') ? stripHtml(rawBody) : rawBody
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    title: pickStr(raw.name) ?? '',
    body,
    category: pickStr(raw.templateFor),
    platform: 'uvdesk',
    metadata: strMap({
      subject: raw.subject,
      isPredefind: raw.isPredefind,
    }),
    raw,
  }
}
