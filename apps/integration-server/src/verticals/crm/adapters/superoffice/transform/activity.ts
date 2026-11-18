import type { Activity } from '../../../schema/activity'
import { positiveId, primaryKey, requireId, text, utcTimestamp, zonedTimestamp } from '../values'

/**
 * GET /api/v1/Appointment/{id} returns SuperOffice.CRM.Services.AppointmentEntity
 * (openapi-v3-Appointment.json). Fields read:
 *   AppointmentId "Primary key", Title "The title of the appointment.",
 *   Description "Description of the appointment.",
 *   Task (TaskListItem: Value "The list item"),
 *   StartDate "date + start time planned",
 *   Completed "Appointment Completed state." enum Unknown | NotStarted | Started | Completed,
 *   Person (PersonId), Contact (ContactId), Sale (SaleId), Associate (AssociateId),
 *   CreatedDate "Registered date in UTC.", UpdatedDate "Updated date in UTC."
 */
export interface RawSuperofficeAppointment {
  AppointmentId?: number
  Title?: string
  Description?: string
  Task?: { Value?: string } | null
  StartDate?: string
  Completed?: string
  Person?: { PersonId?: number } | null
  Contact?: { ContactId?: number } | null
  Sale?: { SaleId?: number } | null
  Associate?: { AssociateId?: number } | null
  CreatedDate?: string
  UpdatedDate?: string
  [key: string]: unknown
}

function completedState(value: unknown): boolean | undefined {
  if (value === 'Completed') return true
  if (value === 'NotStarted' || value === 'Started') return false
  return undefined
}

export function transformActivity(raw: RawSuperofficeAppointment): Activity {
  return {
    id: requireId(raw.AppointmentId, 'appointment'),
    type: text(raw.Task?.Value),
    subject: text(raw.Title),
    note: text(raw.Description),
    contact_id: positiveId(raw.Person?.PersonId),
    company_id: positiveId(raw.Contact?.ContactId),
    deal_id: positiveId(raw.Sale?.SaleId),
    owner_id: positiveId(raw.Associate?.AssociateId),
    due_date: zonedTimestamp(raw.StartDate),
    done: completedState(raw.Completed),
    created_at: utcTimestamp(raw.CreatedDate),
    updated_at: utcTimestamp(raw.UpdatedDate),
    metadata: raw,
  }
}

/**
 * The columns GET /api/v1/Appointment selects. That operation "Calls the
 * Archive service using the "FindAppointment" archive."; its columns, from
 * https://docs.superoffice.com/en/api/archive-providers/reference/findappointment:
 *   type           listAny "Type: Displays the type of an activity"
 *   text           positiveString "Text: Displays a descriptive text for the item"
 *   saleId         int "Sale ID: The database ID of the sale record"
 *   completed      bool "Completed: Displays a checkbox showing if an appointment is completed"
 *   date           date "Date: Displays start date of a follow-up / sale date of a sale"
 *   registeredDate date "Registered date: The date/time the data was registered in UTC."
 *   updatedDate    date "Updated: The date/time the data was last updated in UTC."
 * Booleans need `$output=Logical`: "Logical returns true/false for booleans,
 * Display returns icon hints."
 */
export const APPOINTMENT_COLUMNS = [
  'type',
  'text',
  'saleId',
  'completed',
  'date',
  'registeredDate',
  'updatedDate',
] as const

export function transformActivityRow(row: Record<string, unknown>): Activity {
  const completed = row['completed']
  return {
    id: primaryKey(row, 'appointment'),
    type: text(row['type']),
    note: text(row['text']),
    deal_id: positiveId(row['saleId']),
    done: typeof completed === 'boolean' ? completed : undefined,
    due_date: zonedTimestamp(row['date']),
    created_at: utcTimestamp(row['registeredDate']),
    updated_at: utcTimestamp(row['updatedDate']),
    metadata: row,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.Description = data.subject
  if (data.type !== undefined) out.Type = data.type
  if (data.due_date !== undefined) out.EndDate = data.due_date
  if (data.done !== undefined) out.Completed = data.done ? 'Completed' : 'NotStarted'
  if (data.company_id !== undefined) out.Contact = { ContactId: Number(data.company_id) }
  if (data.owner_id !== undefined) out.Associate = { AssociateId: Number(data.owner_id) }
  if (data.deal_id !== undefined) out.SaleId = Number(data.deal_id)
  return out
}
