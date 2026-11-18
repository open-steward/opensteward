import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'
import {
  primaryEmailAddress,
  primaryPhoneNumber,
  refId,
  type MoskitEmail,
  type MoskitEntityId,
  type MoskitPhone,
} from '../entity'

/**
 * Contact.v2.yaml ("Contato"), the fields read here.
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Contact.v2.yaml
 * Employment.v2.yaml: company (EntityId), contact (EntityId), jobTitle.
 */
export interface RawMoskitContact {
  id: number
  createdBy?: MoskitEntityId | null
  responsible?: MoskitEntityId | null
  dateCreated?: string
  name?: string
  primaryEmail?: MoskitEntityId | null
  primaryPhone?: MoskitEntityId | null
  phones?: MoskitPhone[] | null
  emails?: MoskitEmail[] | null
  employers?: Array<{
    company?: MoskitEntityId | null
    contact?: MoskitEntityId | null
    jobTitle?: string
  }> | null
  [key: string]: unknown
}

export function transformContact(raw: RawMoskitContact): Contact {
  // "employers: Empresas relacionadas" — a contact may have several; only an
  // unambiguous single employer is mapped to the canonical company and title.
  const employer = raw.employers?.length === 1 ? raw.employers[0] : undefined
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    email: primaryEmailAddress(raw.primaryEmail, raw.emails),
    phone: primaryPhoneNumber(raw.primaryPhone, raw.phones),
    company_id: refId(employer?.company),
    title: employer?.jobTitle || undefined,
    owner_id: refId(raw.responsible),
    created_at: toIsoDatetime(raw.dateCreated),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.company_id !== undefined) out.company = { id: data.company_id }
  if (data.owner_id !== undefined) out.owner = { id: data.owner_id }
  return out
}
