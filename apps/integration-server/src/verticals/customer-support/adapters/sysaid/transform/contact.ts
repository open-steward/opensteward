/**
 * Transform SysAid end-user → canonical Contact.
 *
 * SysAid end-user fields (Connect API v1: GET /end-users):
 *   id, userEmail, userName, firstName, lastName, displayName,
 *   workPhone, mobile, companyId, departmentId, isDisabled
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSysaidEndUser {
  id?: number | string
  userEmail?: string
  userName?: string
  firstName?: string
  lastName?: string
  displayName?: string
  workPhone?: string | null
  mobile?: string | null
  companyId?: number | string | null
  departmentId?: number | string | null
  isDisabled?: boolean
  [key: string]: unknown
}

export function transformContact(raw: RawSysaidEndUser): Contact {
  const joinedName = [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean).join(' ')
  const displayName =
    pickStr(raw.displayName) ??
    (joinedName || pickStr(raw.userName)) ??
    ''

  const phone = pickStr(raw.mobile) ?? pickStr(raw.workPhone)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: pickStr(raw.userEmail),
    name: displayName,
    phone,
    organizationId: raw.companyId ? String(raw.companyId) : undefined,
    platform: 'sysaid',
    metadata: strMap({
      userName: raw.userName,
      departmentId: raw.departmentId,
      isDisabled: raw.isDisabled,
    }),
    raw,
  }
}
