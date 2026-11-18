import type { Contact } from '../../../schema/contact'
import { present, recordId, type RawTwentyRecord } from '../records'

/**
 * Twenty "people" (PersonWorkspaceEntity, twentyhq/twenty
 * packages/twenty-server/src/modules/person/standard-objects/person.workspace-entity.ts):
 *   name: FullNameMetadata | null     ({ firstName, lastName })
 *   emails: EmailsMetadata            ({ primaryEmail, additionalEmails })
 *   phones: PhonesMetadata            ({ primaryPhoneNumber, primaryPhoneCountryCode,
 *                                        primaryPhoneCallingCode, additionalPhones })
 *   jobTitle: string | null
 *   companyId: string | null          (MANY_TO_ONE join column, returned at depth 0)
 */
export interface RawTwentyPerson extends RawTwentyRecord {
  name?: { firstName?: string | null; lastName?: string | null } | null
  emails?: { primaryEmail?: string | null; additionalEmails?: string[] | null } | null
  phones?: {
    primaryPhoneNumber?: string | null
    primaryPhoneCountryCode?: string | null
    primaryPhoneCallingCode?: string | null
    additionalPhones?: unknown[] | null
  } | null
  jobTitle?: string | null
  companyId?: string | null
}

export function transformContact(raw: RawTwentyPerson): Contact {
  const firstName = present(raw.name?.firstName)
  const lastName = present(raw.name?.lastName)
  return {
    id: recordId(raw, 'person'),
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(' ') || undefined,
    email: present(raw.emails?.primaryEmail),
    phone: present(raw.phones?.primaryPhoneNumber),
    title: present(raw.jobTitle),
    company_id: present(raw.companyId),
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined || data.last_name !== undefined) {
    out.name = { firstName: data.first_name ?? '', lastName: data.last_name ?? '' }
  }
  if (data.email !== undefined) out.emails = { primaryEmail: data.email }
  if (data.phone !== undefined) out.phones = { primaryPhoneNumber: data.phone }
  if (data.company_id !== undefined) out.companyId = data.company_id
  return out
}
