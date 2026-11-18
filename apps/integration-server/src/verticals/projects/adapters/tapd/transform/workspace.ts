import type { Workspace } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw TAPD Workspace object returned by:
 *   GET /workspaces/projects  (GetCompanyWorkspaces)
 *   GET /workspaces/info      (GetWorkspaceInfo)
 *
 * TAPD calls a "workspace" what most tools call a "project".
 * At the canonical level we map it to Workspace because the TAPD
 * company is the true workspace and each TAPD workspace is a project.
 *
 * Ref: https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/workspace/
 */
export interface RawTapdWorkspace {
  id: string
  name?: string
  pretty_name?: string
  description?: string
  status?: string
  category?: string
  creator?: string
  created?: string
  begin_date?: string
  end_date?: string
  company_id?: string
  parent_id?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawTapdWorkspace): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.pretty_name ?? raw.name) ?? '',
    platform: 'tapd',
    metadata: strMap({
      status: raw.status,
      category: raw.category,
      creator: raw.creator,
      createdAt: toIso(raw.created),
      beginDate: toIso(raw.begin_date),
      endDate: toIso(raw.end_date),
      companyId: raw.company_id,
      parentId: raw.parent_id,
    }),
    raw,
  }
}
