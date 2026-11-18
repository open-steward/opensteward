import type { Note } from '../../../schema/note'
import { present, recordId, type RawTwentyRecord } from '../records'

/**
 * Twenty "notes" (NoteWorkspaceEntity, twentyhq/twenty
 * packages/twenty-server/src/modules/note/standard-objects/note.workspace-entity.ts):
 *   title: string
 *   bodyV2: RichTextMetadata | null   ({ blocknote?: string | null, markdown: string | null })
 *   createdBy: ActorMetadata          (workspaceMemberId is the authoring member)
 *
 * The records a note is attached to live on the separate noteTargets object
 * (a ONE_TO_MANY relation, not returned at the default depth 0), so
 * contact_id / company_id / deal_id stay unset.
 */
export interface RawTwentyNote extends RawTwentyRecord {
  title?: string | null
  bodyV2?: { blocknote?: string | null; markdown?: string | null } | null
}

export function transformNote(raw: RawTwentyNote): Note {
  return {
    id: recordId(raw, 'note'),
    // A note with no body has empty content; that is what Twenty holds.
    content: raw.bodyV2?.markdown ?? '',
    owner_id: present(raw.createdBy?.workspaceMemberId),
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.body = data.content
  return out
}
