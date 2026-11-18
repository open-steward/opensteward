import type { Task, TaskStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * ZenHub issue — mapped to the canonical Task.
 *
 * ZenHub issues are GitHub issues enriched with ZenHub metadata (estimate,
 * pipeline, sprints, labels). They are the atomic unit of work in ZenHub.
 *
 * GraphQL shape (from `searchIssuesByPipeline` or `node ... on Sprint { sprintIssues }`):
 *   id              String
 *   number          Int         (GitHub issue number)
 *   title           String
 *   body            String?
 *   state           IssueState  (OPEN | CLOSED)
 *   pullRequest     Boolean
 *   type            String?     (ISSUE | EPIC)
 *   createdAt       DateTime
 *   updatedAt       DateTime
 *   closedAt        DateTime?
 *   ghId            Int?        (GitHub internal node id numeric)
 *   ghNodeId        String?
 *   assignees       { nodes { id login name } }
 *   labels          { nodes { id name color } }
 *   estimate        { value Float }?
 *   pipelineIssue   { pipeline { id name } priority }?
 *   repository      { id ghId name }?
 */
export interface RawZenhubIssue {
  id: string
  number?: number
  title?: string
  body?: string
  state?: string
  pullRequest?: boolean
  type?: string
  createdAt?: string
  updatedAt?: string
  closedAt?: string
  ghId?: number | string
  ghNodeId?: string
  assignees?: { nodes?: Array<{ id: string; login?: string; name?: string }> }
  labels?: { nodes?: Array<{ id: string; name?: string; color?: string }> }
  estimate?: { value?: number } | null
  pipelineIssue?: {
    pipeline?: { id: string; name?: string }
    priority?: number
  } | null
  repository?: { id: string; ghId?: number; name?: string } | null
  [key: string]: unknown
}

function mapStatus(raw: RawZenhubIssue): TaskStatus {
  const s = (raw.state ?? '').toUpperCase()
  if (s === 'CLOSED') return 'closed'
  return 'open'
}

export function transformTask(raw: RawZenhubIssue, projectId?: string): Task {
  const repoId = projectId ?? raw.repository?.id ?? ''
  const assigneeIds = (raw.assignees?.nodes ?? []).map((a) => a.id)
  const tagIds = (raw.labels?.nodes ?? []).map((l) => l.id)

  return {
    id: raw.id,
    externalId: raw.id,
    projectId: repoId,
    title: pickStr(raw.title) ?? '',
    description: pickStr(raw.body),
    status: mapStatus(raw),
    dueDate: toIso(raw.closedAt),
    assigneeIds,
    tagIds,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'zenhub',
    metadata: strMap({
      number: raw.number,
      pullRequest: raw.pullRequest,
      type: raw.type,
      pipelineId: raw.pipelineIssue?.pipeline?.id,
      pipelineName: raw.pipelineIssue?.pipeline?.name,
      estimateValue: raw.estimate?.value,
      ghId: raw.ghId,
      ghNodeId: raw.ghNodeId,
    }),
    raw,
  }
}
