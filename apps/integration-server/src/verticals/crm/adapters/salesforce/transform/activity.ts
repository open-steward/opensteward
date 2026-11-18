import type { Activity } from '../../../schema/activity'
import { OPPORTUNITY_ID_PREFIX } from '../constants'

export interface RawSalesforceTask {
  Id: string
  Subject?: string | null
  Description?: string | null
  ActivityDate?: string | null
  Status?: string | null
  OwnerId?: string | null
  WhoId?: string | null
  WhatId?: string | null
  AccountId?: string | null
  CreatedDate?: string
  LastModifiedDate?: string
  [key: string]: unknown
}

/**
 * Event has no `Status` field and its own start/end/duration fields —
 * reusing Task's field list in the SOQL would make the query fail outright,
 * so Event gets its own raw shape and its own transform, {@link transformEvent}.
 */
export interface RawSalesforceEvent {
  Id: string
  Subject?: string | null
  Description?: string | null
  StartDateTime?: string | null
  EndDateTime?: string | null
  DurationInMinutes?: number | null
  IsAllDayEvent?: boolean | null
  OwnerId?: string | null
  WhoId?: string | null
  WhatId?: string | null
  AccountId?: string | null
  CreatedDate?: string
  LastModifiedDate?: string
  [key: string]: unknown
}

/**
 * WhatId is polymorphic (Opportunity, Account, Case, custom objects, ...).
 * Only an Opportunity id maps to `deal_id` — anything else would point a
 * deal link at a record that is not a Deal.
 */
function dealIdFromWhatId(whatId: string | null | undefined): string | undefined {
  return whatId != null && whatId.startsWith(OPPORTUNITY_ID_PREFIX) ? whatId : undefined
}

export function transformActivity(raw: RawSalesforceTask): Activity {
  return {
    id: String(raw.Id),
    type: 'task',
    subject: raw.Subject ?? undefined,
    note: raw.Description ?? undefined,
    due_date: raw.ActivityDate ?? undefined,
    done: raw.Status === 'Completed',
    owner_id: raw.OwnerId ?? undefined,
    contact_id: raw.WhoId ?? undefined,
    company_id: raw.AccountId ?? undefined,
    deal_id: dealIdFromWhatId(raw.WhatId),
    created_at: raw.CreatedDate ?? undefined,
    updated_at: raw.LastModifiedDate ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.Subject = data.subject
  if (data.note !== undefined) out.Description = data.note
  if (data.due_date !== undefined) out.ActivityDate = data.due_date.split('T')[0]
  if (data.done !== undefined) out.Status = data.done ? 'Completed' : 'Not Started'
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  if (data.contact_id !== undefined) out.WhoId = data.contact_id
  // WhatId is the only writable related-record field — AccountId is derived
  // by Salesforce from WhoId/WhatId and rejected if sent. Prefer deal_id;
  // fall back to company_id so a company-only link still round-trips.
  const whatId = data.deal_id ?? data.company_id
  if (whatId !== undefined) out.WhatId = whatId
  return out
}

/**
 * Event's own transform. `done` has no source field on Event — it is derived
 * as "the meeting's end time has passed", and left unset (never `false`)
 * when there is no EndDateTime to judge that by, rather than guessed.
 */
export function transformEvent(raw: RawSalesforceEvent): Activity {
  const done = raw.EndDateTime != null ? new Date(raw.EndDateTime).getTime() < Date.now() : undefined
  return {
    id: String(raw.Id),
    type: 'meeting',
    subject: raw.Subject ?? undefined,
    note: raw.Description ?? undefined,
    due_date: raw.StartDateTime ?? undefined,
    done,
    duration_minutes: raw.DurationInMinutes ?? undefined,
    owner_id: raw.OwnerId ?? undefined,
    contact_id: raw.WhoId ?? undefined,
    company_id: raw.AccountId ?? undefined,
    deal_id: dealIdFromWhatId(raw.WhatId),
    created_at: raw.CreatedDate ?? undefined,
    updated_at: raw.LastModifiedDate ?? undefined,
    metadata: raw,
  }
}

export function untransformEvent(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.Subject = data.subject
  if (data.note !== undefined) out.Description = data.note
  if (data.due_date !== undefined) out.StartDateTime = data.due_date
  if (data.duration_minutes !== undefined) out.DurationInMinutes = data.duration_minutes
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  if (data.contact_id !== undefined) out.WhoId = data.contact_id
  const whatId = data.deal_id ?? data.company_id
  if (whatId !== undefined) out.WhatId = whatId
  // AccountId is read-only on Event (derived from WhatId/WhoId) — never write it.
  return out
}
