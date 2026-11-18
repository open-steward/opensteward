/**
 * User (an internal, Standard-license user) → User (agent).
 * https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_user.htm
 *
 * Name: "Concatenation of FirstName and LastName"; Email: "Required. The
 * user's email address"; UserType: "The category of user license";
 * IsActive: "Indicates whether the user has access to log in".
 *
 * Queue membership lives in GroupMember rows, which this adapter does not
 * read per user, so teamIds is empty.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export const USER_FIELDS = [
  'Id',
  'Name',
  'Email',
  'IsActive',
  'UserType',
  'UserRoleId',
  'CreatedDate',
  'LastModifiedDate',
] as const

export interface RawSalesforceUser {
  attributes?: { type?: string; url?: string }
  Id: string
  Name?: string | null
  Email?: string | null
  IsActive?: boolean | null
  UserType?: string | null
  UserRoleId?: string | null
  CreatedDate?: string | null
  LastModifiedDate?: string | null
}

export function transformUser(raw: RawSalesforceUser): User {
  return {
    id: raw.Id,
    externalId: raw.Id,
    email: pickStr(raw.Email),
    name: pickStr(raw.Name) ?? '',
    role: pickStr(raw.UserType),
    teamIds: [],
    platform: 'salesforce-service',
    metadata: strMap({ isActive: raw.IsActive, userRoleId: raw.UserRoleId }),
    raw,
  }
}
