import type { Note } from '../../../schema/note'
import { requireKey } from '../octopus'

/**
 * A Note (https://developer.maximizer.com/reference/octopus-api-docs-objects-note).
 * The Read example scopes Key, Text, RichText, Category, Important, Type,
 * DateTime and ParentKey. Create sends "RichText": "<div>NoteRichText</div>"
 * with the comment "Instead of RichText you can use "Text": "Plain text"".
 * "ParentKey can be key of Opportunity, AbEntry, Lead or Case", which the Key
 * alone does not tell apart, so it stays in metadata.
 */
export interface RawMaximizerNote {
  Key: string
  Text?: string | null
  RichText?: string | null
  DateTime?: string | null
  ParentKey?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawMaximizerNote): Note {
  const id = requireKey(raw, 'Note')
  const content =
    typeof raw.Text === 'string'
      ? raw.Text
      : typeof raw.RichText === 'string'
        ? raw.RichText
        : undefined
  if (content === undefined) throw new Error(`Maximizer note ${id} has neither Text nor RichText`)
  return { id, content, metadata: raw }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.NoteContent = data.content
  if (data.contact_id !== undefined) out.ContactKey = data.contact_id
  if (data.company_id !== undefined) out.CompanyKey = data.company_id
  if (data.deal_id !== undefined) out.OpportunityKey = data.deal_id
  if (data.owner_id !== undefined) out.AssignedTo = data.owner_id
  return out
}
