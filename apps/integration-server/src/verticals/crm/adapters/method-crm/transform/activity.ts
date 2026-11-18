import type { Activity } from '../../../schema/activity'

/**
 * Method CRM Activity table raw record shape.
 *
 * Table name  : Activity
 * Key fields  : RecordId, Type, Comments, Status, DueDate, StartDate,
 *               ContactRecordID, OpportunityRecordID, AssignedTo,
 *               CreatedDate, ModifiedDate
 */
export interface RawMethodActivity {
  RecordId: string | number
  Type?: string
  Comments?: string
  Status?: string
  DueDate?: string
  StartDate?: string
  ContactRecordID?: string | number
  OpportunityRecordID?: string | number
  AssignedTo?: string
  CreatedDate?: string
  ModifiedDate?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawMethodActivity): Activity {
  return {
    id: String(raw.RecordId),
    type: typeof raw.Type === 'string' ? raw.Type : undefined,
    note: typeof raw.Comments === 'string' ? raw.Comments : undefined,
    contact_id:
      raw.ContactRecordID !== undefined && raw.ContactRecordID !== null
        ? String(raw.ContactRecordID)
        : undefined,
    deal_id:
      raw.OpportunityRecordID !== undefined && raw.OpportunityRecordID !== null
        ? String(raw.OpportunityRecordID)
        : undefined,
    owner_id: typeof raw.AssignedTo === 'string' ? raw.AssignedTo : undefined,
    due_date: typeof raw.DueDate === 'string' ? raw.DueDate : undefined,
    done: typeof raw.Status === 'string' ? raw.Status.toLowerCase() === 'completed' : undefined,
    created_at: typeof raw.CreatedDate === 'string' ? raw.CreatedDate : undefined,
    updated_at: typeof raw.ModifiedDate === 'string' ? raw.ModifiedDate : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.Type = data.type
  if (data.note !== undefined) out.Comments = data.note
  if (data.due_date !== undefined) out.DueDate = data.due_date
  if (data.done !== undefined) out.Status = data.done ? 'Completed' : 'Open'
  return out
}
