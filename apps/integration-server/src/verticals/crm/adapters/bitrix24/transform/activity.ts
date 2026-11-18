import type { Activity } from '../../../schema/activity'

// OWNER_TYPE_ID values: 1 = lead, 2 = deal, 3 = contact, 4 = company
const OWNER_TYPE_CONTACT = 3
const OWNER_TYPE_DEAL = 2

interface Binding {
  OWNER_TYPE_ID: string | number
  OWNER_ID: string | number
}

export interface RawBitrix24Activity {
  ID: string
  SUBJECT?: string
  DESCRIPTION?: string
  DEADLINE?: string | null
  RESPONSIBLE_ID?: string | null
  BINDINGS?: Binding[]
  COMPLETED?: string
  DATE_CREATE?: string
  DATE_MODIFY?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawBitrix24Activity): Activity {
  const contactBinding = raw.BINDINGS?.find(
    (b) => Number(b.OWNER_TYPE_ID) === OWNER_TYPE_CONTACT,
  )
  const dealBinding = raw.BINDINGS?.find(
    (b) => Number(b.OWNER_TYPE_ID) === OWNER_TYPE_DEAL,
  )

  return {
    id: String(raw.ID),
    subject: raw.SUBJECT,
    note: raw.DESCRIPTION,
    due_date: raw.DEADLINE ?? undefined,
    contact_id: contactBinding ? String(contactBinding.OWNER_ID) : undefined,
    deal_id: dealBinding ? String(dealBinding.OWNER_ID) : undefined,
    owner_id: raw.RESPONSIBLE_ID ? String(raw.RESPONSIBLE_ID) : undefined,
    done: raw.COMPLETED === 'Y',
    created_at: raw.DATE_CREATE,
    updated_at: raw.DATE_MODIFY,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (data.subject !== undefined) fields.SUBJECT = data.subject
  if (data.note !== undefined) fields.DESCRIPTION = data.note
  if (data.due_date !== undefined) fields.DEADLINE = data.due_date
  if (data.owner_id !== undefined) fields.RESPONSIBLE_ID = data.owner_id
  if (data.done !== undefined) fields.COMPLETED = data.done ? 'Y' : 'N'

  const bindings: Binding[] = []
  if (data.contact_id !== undefined) {
    bindings.push({ OWNER_TYPE_ID: OWNER_TYPE_CONTACT, OWNER_ID: data.contact_id })
  }
  if (data.deal_id !== undefined) {
    bindings.push({ OWNER_TYPE_ID: OWNER_TYPE_DEAL, OWNER_ID: data.deal_id })
  }
  if (bindings.length > 0) fields.BINDINGS = bindings

  return fields
}
