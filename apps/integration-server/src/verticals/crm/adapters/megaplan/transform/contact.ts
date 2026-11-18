/**
 * Megaplan API v3 ContractorHuman → canonical Contact.
 *
 * Megaplan's clients (Контрагенты) are either a ContractorCompany or a
 * ContractorHuman ("Контактное лицо компании или клиент-физическое лицо").
 * Only the human is a Contact.
 *
 * Fields, from the first-party RAML type ContractorHuman (served by every
 * account at /api/v3, e.g. https://demo.megaplan.ru/api/v3/):
 *   id (string), contentType, firstName, middleName, lastName, name, position,
 *   company: ContractorCompany|ContractorHuman,
 *   responsibles: (ContractorCompany|ContractorHuman|Employee|Group)[],
 *   contactInfo: (Address|ContactInfo)[],
 *   tags: Tag[],
 *   timeCreated / timeUpdated: DateTime.
 * ContactInfo: type (enum email, jabber, icq, skype, link, phone, telegram,
 * whatsapp, viber, instagram, max_messenger), value (required), isMain
 * ("Основной"). DateTime: value, "Дата и время в ISO 8601 формате". Tag: name.
 *
 * The type carries no email, phone or mobile field of its own; email and
 * phone come from contactInfo, and there is no documented mobile/work split.
 */

import type { Contact } from '../../../schema/contact'
import { toIsoDatetime } from '@opensteward/shared'

/** A link entity: "сущности, у которых есть всего два поля: ContentType и id". */
export interface MegaplanEntityRef {
  id?: string
  contentType?: string
}

/** RAML DateTime. */
export interface MegaplanDateTime {
  contentType?: string
  value?: string
}

/** RAML ContactInfo (an Address has contentType 'Address' and is skipped). */
export interface MegaplanContactInfo {
  contentType?: string
  type?: string
  value?: string
  comment?: string
  isMain?: boolean
}

export interface RawMegaplanContractor {
  id?: string
  contentType?: string
  firstName?: string
  middleName?: string
  lastName?: string
  name?: string
  position?: string
  company?: MegaplanEntityRef
  responsibles?: MegaplanEntityRef[]
  contactInfo?: MegaplanContactInfo[]
  tags?: Array<MegaplanEntityRef & { name?: string }>
  timeCreated?: MegaplanDateTime
  timeUpdated?: MegaplanDateTime
  [key: string]: unknown
}

/** The contentType of a person client. */
export const CONTRACTOR_HUMAN = 'ContractorHuman'

export function transformContact(raw: RawMegaplanContractor): Contact {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('Megaplan ContractorHuman has no id')
  }
  const company = raw.company?.contentType === 'ContractorCompany' ? raw.company : undefined
  const owner = raw.responsibles?.find((r) => r.contentType === 'Employee')
  const tags = raw.tags
    ?.map((t) => t.name)
    .filter((n): n is string => typeof n === 'string' && n !== '')

  return {
    id: raw.id,
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: raw.name,
    email: contactValue(raw.contactInfo, 'email'),
    phone: contactValue(raw.contactInfo, 'phone'),
    title: raw.position,
    company_id: company?.id,
    owner_id: owner?.id,
    ...(tags !== undefined ? { tags } : {}),
    created_at: toIsoDatetime(raw.timeCreated?.value),
    updated_at: toIsoDatetime(raw.timeUpdated?.value),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** The main ContactInfo value of `type`, else the first of that type. */
function contactValue(
  info: MegaplanContactInfo[] | undefined,
  type: 'email' | 'phone',
): string | undefined {
  const ofType = (info ?? []).filter(
    (c) =>
      c.contentType === 'ContactInfo' &&
      c.type === type &&
      typeof c.value === 'string' &&
      c.value !== '',
  )
  return (ofType.find((c) => c.isMain === true) ?? ofType[0])?.value
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    contentType: 'Client',
  }
  if (data.first_name !== undefined) out['firstName'] = data.first_name
  if (data.last_name !== undefined) out['lastName'] = data.last_name
  if (data.email !== undefined) out['email'] = data.email
  if (data.phone !== undefined) out['phones'] = [{ number: data.phone, type: 'work' }]
  if (data.title !== undefined) out['position'] = data.title
  if (data.company_id !== undefined) {
    out['contractors'] = [{ contentType: 'Contractor', id: data.company_id }]
  }
  if (data.owner_id !== undefined) {
    out['responsibles'] = [{ contentType: 'Employee', id: data.owner_id }]
  }
  return out
}
