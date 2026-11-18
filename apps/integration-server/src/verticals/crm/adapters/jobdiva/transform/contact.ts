/**
 * JobDiva candidate → canonical Contact transform.
 *
 * In JobDiva, "candidates" are the people that staffing agencies place.
 * We map them to the CRM Contact schema.
 *
 * Wire field names come from the JobDiva /getCandidateDetails and
 * /getNewCandidateRecords endpoints.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

export interface RawJobdivaCandidate {
  /** Internal JobDiva candidate ID. */
  candidateid?: string | number
  id?: string | number
  firstname?: string
  lastname?: string
  name?: string
  email?: string
  phone?: string
  /** Mobile / cell number. */
  cellphone?: string
  /** Job title / current position. */
  jobtitle?: string
  /** Linked client company ID. */
  companyid?: string | number
  /** Record owner / recruiter ID. */
  ownerid?: string | number
  createdat?: string
  modifiedat?: string
  [key: string]: unknown
}

/** Convert a raw JobDiva candidate record to a canonical Contact. Never throws. */
export function transformContact(raw: RawJobdivaCandidate): Contact {
  const id = raw.candidateid ?? raw.id
  const nameParts = [raw.firstname, raw.lastname].filter(Boolean)
  return {
    id: String(id ?? ''),
    first_name: raw.firstname ?? undefined,
    last_name: raw.lastname ?? undefined,
    name:
      nameParts.length > 0
        ? nameParts.join(' ')
        : (raw.name ?? undefined),
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    mobile: raw.cellphone ?? undefined,
    title: raw.jobtitle ?? undefined,
    company_id: raw.companyid != null ? String(raw.companyid) : undefined,
    owner_id: raw.ownerid != null ? String(raw.ownerid) : undefined,
    created_at: toIsoDatetime(raw.createdat),
    updated_at: toIsoDatetime(raw.modifiedat),
    metadata: raw,
  }
}

/** Convert a partial canonical Contact to a JobDiva createCandidate request body. */
export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.lastname = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.cellphone = data.mobile
  if (data.title !== undefined) out.jobtitle = data.title
  if (data.company_id !== undefined) out.companyid = data.company_id
  return out
}
