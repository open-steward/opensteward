import type { Tag } from '../../../schema'

/**
 * One entry of GET /v3/queues/{queue_ID}/tags
 * (https://yandex.ru/support/tracker/en/api/queues/get-tags): the response is
 * "Array with a list of tags added to the queue. | Array of strings", e.g.
 * `["tag1", "tag2", "tag3"]`. A tag is its name; it belongs to the queue it
 * was listed from.
 */
export type RawYandexTrackerTag = string

export function transformTag(raw: RawYandexTrackerTag, workspaceId: string): Tag {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`Yandex Tracker queue ${workspaceId} returned a tag that is not a string`)
  }
  return {
    id: raw,
    externalId: raw,
    workspaceId,
    name: raw,
    platform: 'yandex-tracker',
    metadata: {},
    raw,
  }
}
