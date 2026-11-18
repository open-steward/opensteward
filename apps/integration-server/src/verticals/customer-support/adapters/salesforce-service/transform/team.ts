/**
 * Group of Type 'Queue' → Team. Group.Type "Queue—Public group that includes
 * all the User records that are members of a queue"; Name is "Required. Name
 * of the group"; Email is the "Email address for a group of type Case.
 * Applies only for a case queue."
 * https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_group.htm
 *
 * Members are GroupMember rows, not a count on Group, so memberCount is unset.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export const QUEUE_FIELDS = [
  'Id',
  'Name',
  'DeveloperName',
  'Type',
  'Email',
  'CreatedDate',
  'LastModifiedDate',
] as const

export interface RawSalesforceGroup {
  attributes?: { type?: string; url?: string }
  Id: string
  Name?: string | null
  DeveloperName?: string | null
  Type?: string | null
  Email?: string | null
  CreatedDate?: string | null
  LastModifiedDate?: string | null
}

export function transformTeam(raw: RawSalesforceGroup): Team {
  return {
    id: raw.Id,
    externalId: raw.Id,
    name: pickStr(raw.Name) ?? pickStr(raw.DeveloperName) ?? '',
    platform: 'salesforce-service',
    metadata: strMap({ developerName: raw.DeveloperName, email: raw.Email, type: raw.Type }),
    raw,
  }
}
