import { toIsoDatetime } from '@opensteward/shared'
import type { Tag } from '../../../schema'
import { strMap } from './shared'

/**
 * Raw TAPD label (LabelPool), as documented for GET https://api.tapd.cn/label
 * (https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/label/query_label.html):
 *   "id id · name 标签名称 · color 颜色ID，枚举值，可选[1,2,3,4] ·
 *    color_value 实际颜色值 · created 创建时间 · workspace_id 项目ID"
 * `creator` appears in the documented example and as a query field (创建人).
 */
export interface RawTapdLabel {
  id: string
  workspace_id?: string
  name?: string
  color?: string
  color_value?: string
  creator?: string
  created?: string
  modified?: string
  [key: string]: unknown
}

/**
 * `workspaceId` is the workspace_id the label was requested under (the
 * endpoint requires it). The canonical id is `{workspace_id}:{id}` so getTag
 * can send it back; externalId is TAPD's own label id.
 */
export function transformTag(raw: RawTapdLabel, workspaceId: string): Tag {
  if (typeof raw.name !== 'string') {
    throw new Error(`TAPD label ${raw.id} has no documented 'name' field`)
  }
  return {
    id: `${workspaceId}:${raw.id}`,
    externalId: raw.id,
    workspaceId,
    name: raw.name,
    color: raw.color_value || undefined,
    platform: 'tapd',
    metadata: strMap({
      colorId: raw.color,
      creator: raw.creator,
      createdAt: toIsoDatetime(raw.created),
    }),
    raw,
  }
}
