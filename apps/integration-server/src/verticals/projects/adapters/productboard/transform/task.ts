import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Productboard v1 feature → canonical Task.
 *
 * Features are work items nested under products or components. Subfeatures
 * have a `parent.feature` reference. Status is a named object; the canonical
 * status is inferred from the status name. Priority is not a native field.
 *
 * v1 endpoint shape:
 *   GET /features → {
 *     data: [{
 *       id, name, description, type,
 *       status: { id, name },
 *       parent: { product: { id, name, links } },
 *       owner: { email },
 *       timeframe: { startDate, endDate, granularity },
 *       archived, createdAt, updatedAt, links
 *     }]
 *   }
 */
export interface RawProductboardFeature {
  id: string
  name?: string
  description?: string
  type?: string
  status?: { id?: string; name?: string } | null
  parent?: {
    product?: { id?: string; name?: string; links?: { self?: string } }
    feature?: { id?: string; name?: string; links?: { self?: string } }
    component?: { id?: string; name?: string; links?: { self?: string } }
  } | null
  owner?: { email?: string } | null
  timeframe?: { startDate?: string; endDate?: string; granularity?: string } | null
  archived?: boolean
  createdAt?: string
  updatedAt?: string
  links?: { self?: string; html?: string }
  [key: string]: unknown
}

function mapStatus(raw: RawProductboardFeature): TaskStatus {
  if (raw.archived) return 'closed'
  const name = (raw.status?.name ?? '').toLowerCase()
  if (
    name.includes('done') ||
    name.includes('complete') ||
    name.includes('released') ||
    name.includes('shipped') ||
    name.includes('archived')
  ) {
    return 'closed'
  }
  if (
    name.includes('progress') ||
    name.includes('development') ||
    name.includes('working') ||
    name.includes('in review') ||
    name.includes('validation')
  ) {
    return 'in_progress'
  }
  return 'open'
}

export function transformTask(raw: RawProductboardFeature, projectId?: string): Task {
  const isSubfeature = raw.type === 'subfeature'
  // Determine the project (component/product) id from the parent hierarchy
  const parentComponentId =
    raw.parent?.component?.id ?? raw.parent?.product?.id
  const pid = projectId ?? parentComponentId ?? ''
  const parentFeatureId = isSubfeature ? pickStr(raw.parent?.feature?.id) : undefined

  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: parentFeatureId,
    title: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: toIso(raw.timeframe?.endDate),
    assigneeIds: [],
    tagIds: [],
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'productboard',
    metadata: strMap({
      platformType: isSubfeature ? 'subfeature' : 'feature',
      statusId: raw.status?.id,
      statusName: raw.status?.name,
      ownerEmail: raw.owner?.email,
      htmlUrl: raw.links?.html,
      timeframeGranularity: raw.timeframe?.granularity,
    }),
    raw,
  }
}
