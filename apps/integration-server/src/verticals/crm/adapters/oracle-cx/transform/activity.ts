import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * One item of GET /crmRestApi/resources/{version}/activities, reading only the
 * attributes of `activities-item-response`
 * (https://docs.oracle.com/en/cloud/saas/sales/faaps/op-activities-get.html).
 *
 * The description attributes (ActivityDescription, ActivityDescriptionPlainText)
 * are typed "string (byte)" and documented as Base64 on input, so they are not
 * mapped to `note`.
 */
export interface RawOracleCxActivity {
  /** "The unique identifier of the activity." */
  ActivityId: number | string
  /** "The unique subject, name, or title of the activity." */
  Subject?: string | null
  /** "The date the task activity is due to be completed." (format: date) */
  DueDate?: string | null
  /** "The unique identifier of the activity owner. Identifies only resources." */
  OwnerId?: number | string | null
  /** "The unique identifier of the activity contact." */
  PrimaryContactId?: number | string | null
  /** "The unique identifier of the activity account." */
  AccountId?: number | string | null
  /** "The unique identifier of the related opportunity." */
  OpportunityId?: number | string | null
  /** "The date when the activity was created." */
  CreationDate?: string | null
  /** "The date and time when the activity was last updated." */
  LastUpdateDate?: string | null
  [key: string]: unknown
}

/** Attributes requested with `fields=`, all named in `activities-item-response`. */
export const ACTIVITY_FIELDS = [
  'ActivityId',
  'Subject',
  'DueDate',
  'OwnerId',
  'PrimaryContactId',
  'AccountId',
  'OpportunityId',
  'CreationDate',
  'LastUpdateDate',
].join(',')

function idOf(v: number | string | null | undefined): string | undefined {
  return v != null ? String(v) : undefined
}

export function transformActivity(raw: RawOracleCxActivity): Activity {
  return {
    id: String(raw.ActivityId),
    subject: raw.Subject ?? undefined,
    due_date: toIsoDatetime(raw.DueDate),
    owner_id: idOf(raw.OwnerId),
    contact_id: idOf(raw.PrimaryContactId),
    company_id: idOf(raw.AccountId),
    deal_id: idOf(raw.OpportunityId),
    created_at: toIsoDatetime(raw.CreationDate),
    updated_at: toIsoDatetime(raw.LastUpdateDate),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.Subject = data.subject
  if (data.note !== undefined) out.Description = data.note
  if (data.due_date !== undefined) out.PlannedEndDate = data.due_date
  if (data.owner_id !== undefined) out.OwnedByPartyId = data.owner_id
  if (data.contact_id !== undefined) out.PrimaryContactPartyId = data.contact_id
  return out
}
