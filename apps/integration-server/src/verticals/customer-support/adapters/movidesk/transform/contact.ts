/**
 * Movidesk (Zenvia Service) person → Contact transform.
 *
 * Contacts are persons with profileType=2 (Client) or profileType=3 (Agent+Client).
 * Retrieved via GET /public/v1/persons?$filter=profileType eq 2
 *
 * Movidesk person fields:
 *   id (string, alphanumeric ref code)
 *   businessName (display name)
 *   corporateName (company/legal name)
 *   emails[].email + emails[].isDefault
 *   contacts[].contact + contacts[].contactType (phone)
 *   personType: 1=Individual, 2=Company, 4=Department
 *   profileType: 1=Agent, 2=Client, 3=Agent+Client
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawMovideskEmailEntry {
  emailType?: string | null
  email?: string | null
  isDefault?: boolean | null
  [key: string]: unknown
}

export interface RawMovideskContactEntry {
  contactType?: string | null
  contact?: string | null
  isDefault?: boolean | null
  [key: string]: unknown
}

export interface RawMovideskContactPerson {
  id?: string | null
  codeReferenceAdditional?: string | null
  businessName?: string | null
  corporateName?: string | null
  personType?: number | null
  profileType?: number | null
  isActive?: boolean | null
  emails?: RawMovideskEmailEntry[] | null
  contacts?: RawMovideskContactEntry[] | null
  [key: string]: unknown
}

function pickDefaultEmail(
  entries: RawMovideskEmailEntry[] | null | undefined,
): string | undefined {
  if (!entries || entries.length === 0) return undefined
  const def = entries.find((e) => e.isDefault)
  return pickStr((def ?? entries[0])?.email)
}

function pickDefaultPhone(
  entries: RawMovideskContactEntry[] | null | undefined,
): string | undefined {
  if (!entries || entries.length === 0) return undefined
  const phoneTypes = ['mobile phone', 'phone', 'commercial phone', 'home phone']
  const phone = entries.find(
    (e) =>
      phoneTypes.includes((e.contactType ?? '').toLowerCase()) ||
      e.isDefault,
  )
  return pickStr(phone?.contact)
}

export function transformContact(raw: RawMovideskContactPerson): Contact {
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.codeReferenceAdditional ?? raw.id) ?? '',
    email: pickDefaultEmail(raw.emails),
    name: pickStr(raw.businessName) ?? '',
    phone: pickDefaultPhone(raw.contacts),
    organizationId: undefined,
    platform: 'movidesk',
    metadata: strMap({
      corporateName: raw.corporateName,
      personType: raw.personType,
      profileType: raw.profileType,
      isActive: raw.isActive,
    }),
    raw,
  }
}
