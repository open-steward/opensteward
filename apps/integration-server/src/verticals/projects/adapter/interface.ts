export type { Credentials, QueryParams } from '@opensteward/shared'
import type { Credentials, QueryParams, BaseAdapter } from '@opensteward/shared'

import type { Project } from '../schema/project'
import type { Task } from '../schema/task'
import type { Comment } from '../schema/comment'
import type { Tag } from '../schema/tag'
import type { Workspace } from '../schema/workspace'
import type { User } from '../schema/user'
import type { WebhookEvent } from '../schema/webhook'

/**
 * ProjectsAdapter — extends BaseAdapter with project / task management
 * resource methods.
 *
 * Read-only B2B. Schema-as-firewall: no attachment content, no time-
 * tracking, no PII beyond name+email, no custom-field schemas.
 */
export interface ProjectsAdapter extends BaseAdapter {
  parseWebhookEvents?(payload: Record<string, unknown>): WebhookEvent[]

  // ── Projects ─────────────────────────────────────────────────────────────
  listProjects?(credentials: Credentials, params: QueryParams): Promise<Project[]>
  getProject?(credentials: Credentials, id: string): Promise<Project>

  // ── Tasks ────────────────────────────────────────────────────────────────
  listTasks?(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]>
  getTask?(credentials: Credentials, id: string): Promise<Task>

  // ── Comments ─────────────────────────────────────────────────────────────
  listComments?(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]>
  getComment?(credentials: Credentials, id: string): Promise<Comment>

  // ── Tags ─────────────────────────────────────────────────────────────────
  listTags?(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<Tag[]>
  getTag?(credentials: Credentials, id: string): Promise<Tag>

  // ── Workspaces ───────────────────────────────────────────────────────────
  listWorkspaces?(credentials: Credentials, params: QueryParams): Promise<Workspace[]>
  getWorkspace?(credentials: Credentials, id: string): Promise<Workspace>

  // ── Users ────────────────────────────────────────────────────────────────
  listUsers?(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]>
  getUser?(credentials: Credentials, id: string): Promise<User>
}
