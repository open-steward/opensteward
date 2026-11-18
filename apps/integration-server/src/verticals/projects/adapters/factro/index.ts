/**
 * Factro adapter for the projects vertical.
 *
 * Factro is a German project management SaaS. Auth is a static API key passed
 * directly as the Authorization header value (no "Bearer" prefix).
 * Base URL: https://cloud.factro.com/api/core/
 *
 * Resource mapping:
 *  - projects     → GET /projects, GET /projects/{id}
 *  - tasks        → GET /projects/{id}/packages (packages are the work items)
 *  - comments     → GET /projects/{id}/comments  (project-level comments only)
 *  - tags         → GET /projects/tags
 *  - workspaces   → GET /companies (companies are the workspace analogue)
 *  - users        → GET /contacts (contacts are the user analogue)
 *
 * No webhook support is documented in the Factro public API.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { FactroClient } from './client'

import { transformProject, type RawFactroProject } from './transform/project'
import { transformTask, type RawFactroPackage } from './transform/task'
import { transformComment, type RawFactroComment } from './transform/comment'
import { transformTag, type RawFactroTag } from './transform/tag'
import { transformWorkspace, type RawFactroCompany } from './transform/workspace'
import { transformUser, type RawFactroContact } from './transform/user'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FactroAdapterConfig {}

export class FactroAdapter implements ProjectsAdapter {
  readonly platform = 'factro'
  readonly version = '0.1.0'

  constructor(_config?: FactroAdapterConfig) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('factro uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  private client(credentials: Credentials): FactroClient {
    return new FactroClient(credentials)
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, _params: QueryParams): Promise<Project[]> {
    // Factro returns all projects in one flat array; no server-side pagination
    const items = await this.client(credentials).get<RawFactroProject[]>('projects')
    return (items ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const item = await this.client(credentials).get<RawFactroProject>(`projects/${id}`)
    if (!item) throw new Error(`Factro project ${id} not found`)
    return transformProject(item)
  }

  // ── Tasks (packages) ───────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, _params: QueryParams): Promise<Task[]> {
    const items = await this.client(credentials).get<RawFactroPackage[]>(
      `projects/${projectId}/packages`,
    )
    return (items ?? []).map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const item = await this.client(credentials).get<RawFactroPackage>(`packages/${id}`)
    if (!item) throw new Error(`Factro package ${id} not found`)
    return transformTask(item)
  }

  // ── Comments (project-level) ───────────────────────────────────────────────

  async listComments(credentials: Credentials, taskId: string, _params: QueryParams): Promise<Comment[]> {
    // taskId here is the projectId; Factro comments live on projects
    const items = await this.client(credentials).get<RawFactroComment[]>(
      `projects/${taskId}/comments`,
    )
    return (items ?? []).map((c) => transformComment(c, taskId, true))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // Factro has no single-comment fetch endpoint; not supported
    throw new Error(`Factro does not support fetching a single comment by id (requested: ${id})`)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, _workspaceId: string, _params: QueryParams): Promise<Tag[]> {
    // Factro project tags are tenant-wide
    const items = await this.client(credentials).get<RawFactroTag[]>('projects/tags')
    return (items ?? []).map((t) => transformTag(t))
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // No single-tag endpoint; fetch all and filter
    const items = await this.client(credentials).get<RawFactroTag[]>('projects/tags')
    const found = (items ?? []).find((t) => t.id === id)
    if (!found) throw new Error(`Factro tag ${id} not found`)
    return transformTag(found)
  }

  // ── Workspaces (companies) ─────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, _params: QueryParams): Promise<Workspace[]> {
    const items = await this.client(credentials).get<RawFactroCompany[]>('companies')
    return (items ?? []).map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const item = await this.client(credentials).get<RawFactroCompany>(`companies/${id}`)
    if (!item) throw new Error(`Factro company ${id} not found`)
    return transformWorkspace(item)
  }

  // ── Users (contacts) ──────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, _workspaceId: string, _params: QueryParams): Promise<User[]> {
    const items = await this.client(credentials).get<RawFactroContact[]>('contacts')
    return (items ?? []).map((u) => transformUser(u))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const item = await this.client(credentials).get<RawFactroContact>(`contacts/${id}`)
    if (!item) throw new Error(`Factro contact ${id} not found`)
    return transformUser(item)
  }
}
