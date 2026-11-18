import type { Activity } from '../../../schema/activity'
import { type MondayItem, getColumnValue } from '../client'

/**
 * Maps a Monday.com board item to a canonical Activity.
 *
 * Monday boards don't have native activity semantics, so we map by convention:
 *   - item.name           → subject
 *   - column "status"     → type  (call / meeting / task / etc.)
 *   - column "text"       → note
 *   - column "date"       → due_date
 *   - column "people"     → owner_id  (first assignee id via text)
 *   - column "connect_boards" (text) → contact_id  (caller-configured column)
 *   - column "checkbox"   → done
 *
 * The activityBoardId must be supplied in credentials.extra.activityBoardId.
 */
export function transformActivity(raw: MondayItem): Activity {
  const statusText = getColumnValue(raw, 'status')
  const dateText = getColumnValue(raw, 'date')
  const checkboxText = getColumnValue(raw, 'checkbox')

  return {
    id: raw.id,
    subject: raw.name || undefined,
    type: statusText ?? undefined,
    note: getColumnValue(raw, 'text') ?? undefined,
    due_date: dateText ?? undefined,
    owner_id: getColumnValue(raw, 'people') ?? undefined,
    contact_id: getColumnValue(raw, 'connect_boards') ?? undefined,
    done: checkboxText === 'v' || checkboxText === 'true',
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const columnValues: Record<string, unknown> = {}
  if (data.type !== undefined) columnValues['status'] = { label: data.type }
  if (data.note !== undefined) columnValues['text'] = data.note
  if (data.due_date !== undefined) columnValues['date'] = { date: data.due_date.split('T')[0] }
  if (data.done !== undefined) columnValues['checkbox'] = { checked: data.done ? 'true' : 'false' }
  if (data.owner_id !== undefined) columnValues['people'] = { personsAndTeams: [{ id: Number(data.owner_id), kind: 'person' }] }
  return {
    name: data.subject ?? 'Activity',
    column_values: JSON.stringify(columnValues),
  }
}
