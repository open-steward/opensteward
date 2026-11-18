import type { Note } from '../../../schema/note'

/**
 * `Note` in the Keap REST v2 OpenAPI spec
 * (https://crm.infusionsoft.com/app/v3/api-docs/V2): `id`, `title` ("Note
 * title"), `text` ("Note content"), `contact_id` ("Associated contact ID"),
 * `assigned_to_user` (`BasicUser`, with `id`), `create_time`, `update_time`.
 */
export interface RawKeapNote {
  id: string
  title?: string
  text?: string
  type?: string
  contact_id?: string | null
  assigned_to_user?: { id?: string } | null
  create_time?: string
  update_time?: string
  [key: string]: unknown
}

export function transformNote(raw: RawKeapNote, contactId?: string): Note {
  return {
    id: String(raw.id),
    content: [raw.title, raw.text].filter(Boolean).join('\n'),
    contact_id: raw.contact_id != null ? String(raw.contact_id) : contactId,
    owner_id: raw.assigned_to_user?.id != null ? String(raw.assigned_to_user.id) : undefined,
    created_at: raw.create_time,
    updated_at: raw.update_time,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) {
    const [title, ...rest] = data.content.split('\n')
    out.title = title
    if (rest.length > 0) out.body = rest.join('\n')
  }
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  return out
}
