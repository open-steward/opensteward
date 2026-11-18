import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * PingCode work-item tag (`GET /v1/project/work_item_tags`).
 *
 * Tags are enterprise-wide (not per-project).  The list endpoint
 * `GET /v1/project/work_item_tags` returns all tags in the enterprise;
 * `GET /v1/project/work_item/tags?project_id=X` narrows to tags used in a
 * project.  We use the enterprise-wide list because the canonical interface
 * passes `workspaceId` (which maps to the PingCode enterprise / tenant).
 *
 * Fields:
 *   - `id` — tag id.
 *   - `name` — tag display name.
 *   - `color` — hex colour string, e.g. `"#56ABFB"`.
 *
 * Docs: https://open.pingcode.com/  →  Project / Work-item configuration
 */
export interface RawPingcodeTag {
  id: string
  name?: string
  color?: string
  [key: string]: unknown
}

export function transformTag(raw: RawPingcodeTag, enterpriseId?: string): Tag {
  return {
    id: raw.id,
    externalId: raw.id,
    // Tags belong to the enterprise; use the enterprise id as workspaceId.
    workspaceId: enterpriseId ?? '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'pingcode',
    metadata: strMap({}),
    raw,
  }
}
