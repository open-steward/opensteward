import type { Contact } from '../../../schema/contact'
import type { WixContact } from '../client'

/**
 * Contacts v4 `Contact` → canonical Contact. Field paths from
 * https://dev.wix.com/docs/api-reference/crm/members-contacts/contacts/contacts/contact-v4/query-contacts.md:
 * `id` ("Contact GUID."), `info.name.first` / `info.name.last`,
 * `primaryInfo.email` / `primaryInfo.phone` ("Primary email address." /
 * "Primary phone number."), `info.jobTitle`, `createdDate`, `updatedDate`.
 *
 * `source.appId` is "App GUID, if the contact was created by an app." — an
 * app, not a user, so it is not an owner. `info.company` is a name
 * ("Contact's company name."), not a company id, so it is not `company_id`.
 */
export function transformContact(raw: WixContact): Contact {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('Wix contact has no id')
  }
  const first = raw.info?.name?.first
  const last = raw.info?.name?.last
  return {
    id: raw.id,
    first_name: first,
    last_name: last,
    name: [first, last].filter(Boolean).join(' ') || undefined,
    email: raw.primaryInfo?.email,
    phone: raw.primaryInfo?.phone,
    title: raw.info?.jobTitle,
    created_at: raw.createdDate,
    updated_at: raw.updatedDate,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const info: Record<string, unknown> = {}
  if (data.title !== undefined) info.jobTitle = data.title

  const phones: Array<{ tag: string; phone: string }> = []
  if (data.phone) phones.push({ tag: 'MAIN', phone: data.phone })

  const emails: Array<{ tag: string; email: string }> = []
  if (data.email) emails.push({ tag: 'MAIN', email: data.email })

  const nameObj: Record<string, unknown> = {}
  if (data.first_name !== undefined) nameObj.first = data.first_name
  if (data.last_name !== undefined) nameObj.last = data.last_name

  const infoPayload: Record<string, unknown> = { ...info }

  return {
    info: {
      ...infoPayload,
      name: Object.keys(nameObj).length > 0 ? nameObj : undefined,
      phones: phones.length > 0 ? phones : undefined,
      emails: emails.length > 0 ? emails : undefined,
    },
  }
}
