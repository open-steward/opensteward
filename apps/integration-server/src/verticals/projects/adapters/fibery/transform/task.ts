/**
 * Fibery entity → Task.
 *
 * Tasks are the Entities of a user-defined Database, so the only fields every
 * one has are the documented system fields, plus the fields the Database's
 * schema names. This transform reads exactly those:
 *
 *   fibery/id                 UUID
 *   fibery/public-id          sequential id, e.g. "6"
 *   fibery/creation-date      ISO-8601 date-time
 *   fibery/modification-date  ISO-8601 date-time
 *   fibery/created-by         { fibery/id }
 *   <title Field>             the Field whose meta has `ui/title?`
 *   assignments/assignees     [{ fibery/id }] | null, when the Database has it
 *
 * Query Entities (https://developers.fibery.com/guides/http-api/query-entities)
 * gives the system fields in its example response, and notes "in some cases
 * empty collections are returned as nulls". The title Field's `ui/title?` flag
 * is from Databases (https://developers.fibery.com/guides/http-api/databases),
 * and `assignments/assignees` from the Get Schema example
 * (https://developers.fibery.com/guides/http-api/schema).
 *
 * Status, priority, due date and parent are user-defined per Database, and the
 * docs name no field for them in an entity query, so status is `unknown` and
 * the rest are left out.
 */
import type { Task } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFiberyEntity {
  'fibery/id': string
  'fibery/public-id'?: string
  'fibery/creation-date'?: string
  'fibery/modification-date'?: string
  'fibery/created-by'?: { 'fibery/id'?: string } | null
  /** The Database's own Fields, by `${space}/${name}`. */
  [key: string]: unknown
}

/** Which of the Database's Fields hold the title and the assignees. */
export interface FiberyTaskFields {
  /** Name of the Field whose meta has `ui/title?`. */
  titleField: string
  /** `assignments/assignees`, when the Database has that Field. */
  assigneesField?: string
}

function assigneeIds(raw: RawFiberyEntity, field: string | undefined): string[] {
  if (!field) return []
  const value = raw[field]
  if (!Array.isArray(value)) return []
  return value
    .map((a) => pickStr((a as Record<string, unknown> | null)?.['fibery/id']))
    .filter((id): id is string => id !== undefined)
}

export function transformTask(
  raw: RawFiberyEntity,
  projectId: string,
  fields: FiberyTaskFields,
): Task {
  const id = raw['fibery/id']
  const title = raw[fields.titleField]
  return {
    id,
    externalId: id,
    projectId,
    title: typeof title === 'string' ? title : '',
    status: 'unknown',
    assigneeIds: assigneeIds(raw, fields.assigneesField),
    tagIds: [],
    createdAt: toIso(raw['fibery/creation-date']),
    updatedAt: toIso(raw['fibery/modification-date']),
    platform: 'fibery',
    metadata: strMap({
      publicId: raw['fibery/public-id'],
      createdById: raw['fibery/created-by']?.['fibery/id'],
    }),
    raw,
  }
}
