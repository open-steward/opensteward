/**
 * Teamwork Spaces pages → canonical Task.
 *
 * A page lives inside a space (= project), so a task id is the composite
 * `{spaceID}:{pageID}`: every page endpoint is scoped under both ids
 * (GET /spaces/api/v1/spaces/{spaceID}/pages/{pageID}.json, and the inline
 * comments under it), and a bare page id cannot be read back.
 *
 * Two documented page shapes (Spaces v1 swagger,
 * https://apidocs.teamwork.com/api/oas/download?slug=spaces&api_version=v1):
 *
 *  - `spaces-api.Page` — GET /spaces/{spaceID}/pages/{pageID}.json returns
 *    `{ page: {...} }`, "Page model represents a complete page as returned
 *    from the database": id, title, summary, state, isPublished, isPrivate,
 *    parentId, slug, meta, tags[{ tag }], createdAt, createdBy, updatedAt,
 *    deletedAt, ...
 *  - `spaces-api.SpacePages` tree nodes — GET /spaces/{spaceID}/pages.json.
 *    "SpacePages contains a tree of pages nested under their parents." Each
 *    node documents only id, slug, title, updatedAt and childPages.
 */
import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** `spaces-api.LinkedUser` / `spaces-api.LinkedSpace`: { id, meta, type }. */
interface RawSpacesLinked {
  id?: number | string
  type?: string
}

/** `spaces-api.Page.page`. */
export interface RawSpacesPage {
  id: number | string
  title?: string
  summary?: string
  state?: string
  isPublished?: boolean
  isPrivate?: boolean
  isHomePage?: boolean
  isFullWidth?: boolean
  isRequiredReading?: boolean
  parentId?: number | string | null
  order?: number
  slug?: string
  meta?: { timeToRead?: number; wordCount?: number } | null
  tags?: Array<{ tag?: { id?: number | string } }>
  createdAt?: string
  updatedAt?: string
  deletedAt?: string
  createdBy?: RawSpacesLinked | null
  space?: RawSpacesLinked | null
  [key: string]: unknown
}

/** One `spaces-api.SpacePages` tree node. */
export interface RawSpacesTreePage {
  id: number | string
  slug?: string
  title?: string
  updatedAt?: string
  childPages?: RawSpacesTreePage[]
}

/** The canonical task id: pages are addressed by space and page together. */
export function taskId(spaceId: string, pageId: number | string): string {
  return `${spaceId}:${String(pageId)}`
}

/**
 * A full page carries `deletedAt`; a deleted page is closed. The `state`
 * field is a bare string with no documented values, so it is kept in
 * metadata rather than mapped.
 */
function mapStatus(raw: RawSpacesPage): TaskStatus {
  return raw.deletedAt ? 'closed' : 'open'
}

/** A full page (GET /spaces/{spaceID}/pages/{pageID}.json → `page`). */
export function transformTask(raw: RawSpacesPage, spaceId: string): Task {
  const pageId = String(raw.id)
  const tagIds: string[] = []
  for (const entry of raw.tags ?? []) {
    if (entry.tag?.id != null) tagIds.push(String(entry.tag.id))
  }
  return {
    id: taskId(spaceId, pageId),
    externalId: pageId,
    projectId: spaceId,
    parentId: raw.parentId != null ? taskId(spaceId, raw.parentId) : undefined,
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.summary),
    status: mapStatus(raw),
    priority: undefined,
    dueDate: undefined,
    // A page has an author (createdBy), not an assignee.
    assigneeIds: [],
    tagIds,
    subtaskCount: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'teamwork-desk',
    metadata: strMap({
      slug: raw.slug,
      state: raw.state,
      isPublished: raw.isPublished,
      isPrivate: raw.isPrivate,
      isHomePage: raw.isHomePage,
      isRequiredReading: raw.isRequiredReading,
      createdBy: raw.createdBy?.id,
      wordCount: raw.meta?.wordCount,
      timeToRead: raw.meta?.timeToRead,
    }),
    raw,
  }
}

/**
 * A page-tree node (GET /spaces/{spaceID}/pages.json). The node carries no
 * state, so the status is `unknown`; the parent is the node it is nested
 * under; `isPrivate` is which documented subtree it came from ("pages ...
 * open pages with no privacy set as well as private, which contains pages
 * that the user can access, but are restricted to other users").
 */
export function transformTreePage(
  node: RawSpacesTreePage,
  spaceId: string,
  parentPageId: string | undefined,
  isPrivate: boolean,
): Task {
  const pageId = String(node.id)
  const { childPages: _children, ...raw } = node
  return {
    id: taskId(spaceId, pageId),
    externalId: pageId,
    projectId: spaceId,
    parentId: parentPageId !== undefined ? taskId(spaceId, parentPageId) : undefined,
    title: pickStr(node.title) ?? '',
    status: 'unknown',
    assigneeIds: [],
    tagIds: [],
    updatedAt: toIso(node.updatedAt),
    platform: 'teamwork-desk',
    metadata: strMap({ slug: node.slug, isPrivate }),
    raw,
  }
}
