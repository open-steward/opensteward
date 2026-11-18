import type { User } from '../../../schema'
import { pickStr, strMap, toIso, isTruthy, tagNames } from './shared'

/**
 * Float person (`GET /people`) — a scheduled team member. `department` may be
 * an embedded object (`{ department_id, name }`) or a bare id depending on the
 * field-expansion requested; both shapes are handled.
 */
export interface RawFloatPerson {
  people_id: number | string
  name?: string
  email?: string | null
  job_title?: string | null
  department?: { department_id?: number | string; name?: string } | number | string | null
  employee_type?: number | string | null
  people_type_id?: number | string | null
  active?: number | boolean
  tags?: unknown
  created?: string | null
  modified?: string | null
  [key: string]: unknown
}

function departmentId(raw: RawFloatPerson): string | undefined {
  const d = raw.department
  if (d == null) return undefined
  if (typeof d === 'object') {
    return d.department_id != null ? String(d.department_id) : undefined
  }
  return String(d)
}

function departmentName(raw: RawFloatPerson): string | undefined {
  const d = raw.department
  if (d && typeof d === 'object') return pickStr(d.name)
  return undefined
}

export function transformUser(raw: RawFloatPerson): User {
  const id = String(raw.people_id)
  const deptId = departmentId(raw)
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    // Float has no workspace; people belong to the whole account, not a client.
    workspaceIds: [],
    platform: 'float',
    metadata: strMap({
      jobTitle: raw.job_title,
      departmentId: deptId,
      departmentName: departmentName(raw),
      employeeType: raw.employee_type,
      active: raw.active != null ? isTruthy(raw.active) : undefined,
      tags: tagNames(raw.tags).join(',') || undefined,
      createdAt: toIso(raw.created),
    }),
    raw,
  }
}
