import type { Tag } from '../../../schema'

/**
 * ProductPlan idea tag, from GET /api/v2/discovery/ideas/tags
 * (https://productplan.readme.io/reference/get_api-v2-discovery-ideas-tags.md).
 * The documented 200 body is
 * `{"type":"object","properties":{"tags":{"type":"array","items":{"type":"string"}}},"required":["tags"]}`:
 * each tag is a bare string. It carries no id, colour or count, so the string
 * is both the id and the name.
 *
 * ProductPlan exposes no workspace (see index.ts), so `workspaceId` is empty,
 * as it is on this adapter's projects.
 */
export type RawProductplanTag = string

export function transformTag(raw: RawProductplanTag): Tag {
  return {
    id: raw,
    externalId: raw,
    workspaceId: '',
    name: raw,
    platform: 'productplan',
    metadata: {},
    raw,
  }
}
