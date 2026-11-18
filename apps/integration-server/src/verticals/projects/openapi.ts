/**
 * Builds the projects-vertical OpenAPI document.
 */

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import * as schemas from './schema'
import { buildSyncOpenapiSchemas } from '@opensteward/shared'
import { ProjectSchema } from './schema/project'
import { TaskSchema } from './schema/task'
import { CommentSchema } from './schema/comment'
import { TagSchema } from './schema/tag'
import { WorkspaceSchema } from './schema/workspace'
import { UserSchema } from './schema/user'

function isZodSchema(v: unknown): v is z.ZodType {
  return typeof v === 'object' && v !== null && '_def' in (v as Record<string, unknown>)
}

function toSchema(zodSchema: z.ZodType, _name: string): Record<string, unknown> {
  const json = z.toJSONSchema(zodSchema, {
    unrepresentable: 'any',
    override: (ctx) => {
      const def = ctx.zodSchema as { _def?: { type?: string }; _zod?: { def?: { type?: string } } }
      const t = def._def?.type ?? def._zod?.def?.type
      if (t === 'date') {
        for (const k of Object.keys(ctx.jsonSchema)) delete (ctx.jsonSchema as Record<string, unknown>)[k]
        ;(ctx.jsonSchema as Record<string, unknown>).type = 'string'
        ;(ctx.jsonSchema as Record<string, unknown>).format = 'date-time'
      }
    },
  }) as Record<string, unknown>
  delete json.$schema
  return json
}

const ADAPTERS_DIR = path.resolve(__dirname, './adapters')
const PLATFORM_SLUGS = fs
  .readdirSync(ADAPTERS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

const authPlatformParam = {
  name: 'platform',
  in: 'path',
  required: true,
  description: 'Platform slug (e.g. `asana`, `jira`, `linear`).',
  schema: { type: 'string', enum: PLATFORM_SLUGS },
}

const connectionIdParam = {
  name: 'connection_id',
  in: 'query',
  required: true,
  description: 'UUID of the stored connection to use.',
  schema: { type: 'string', format: 'uuid' },
}

const projectIdQueryParam = {
  name: 'project_id',
  in: 'query',
  required: true,
  description: 'Project id to scope the list under (required for tasks).',
  schema: { type: 'string' },
}

const taskIdQueryParam = {
  name: 'task_id',
  in: 'query',
  required: true,
  description: 'Task id to scope the list under (required for comments).',
  schema: { type: 'string' },
}

const workspaceIdQueryParam = {
  name: 'workspace_id',
  in: 'query',
  required: true,
  description: 'Workspace id to scope the list under (required for tags and users).',
  schema: { type: 'string' },
}

const limitParam = {
  name: 'limit',
  in: 'query',
  required: false,
  description:
    "Records per page. Defaults to 100, and is capped at 500 and at the platform's page maximum where the adapter declares one; `meta.limit` reports the page size served.",
  schema: { type: 'integer', minimum: 1, maximum: 500 },
}

const pageParam = {
  name: 'page',
  in: 'query',
  required: false,
  description:
    "Page number, 1-based: page N starts after (N − 1) × `meta.limit` rows. A missing page, or one that is not a decimal number of at least 1, is the first page.",
  schema: { type: 'integer', minimum: 1 },
}

const cursorParam = {
  name: 'cursor',
  in: 'query',
  required: false,
  deprecated: true,
  description: "Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false.",
  schema: { type: 'string' },
}

const idPathParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
}

const baseListQueryParams = [connectionIdParam, limitParam, pageParam, cursorParam]
const getQueryParams = [connectionIdParam]

const errorResponse400 = { $ref: '#/components/responses/BadRequest' }
const errorResponse401 = { $ref: '#/components/responses/Unauthorized' }
const errorResponse404 = { $ref: '#/components/responses/NotFound' }
const errorResponse501 = { $ref: '#/components/responses/NotImplemented' }

function listEnvelope(schemaRef: string) {
  return {
    type: 'object',
    required: ['data'],
    properties: { data: { type: 'array', items: { $ref: schemaRef } } },
  }
}

function singleEnvelope(schemaRef: string) {
  return {
    type: 'object',
    required: ['data'],
    properties: { data: { $ref: schemaRef } },
  }
}

interface OpMeta {
  tag: string
  schemaRef: string
  operationId: string
  summary: string
  description: string
}

// Whole-body `empty` example for a list 200 — the populated case is already
// composed from each resource schema's field examples, so only the empty
// first-page scenario is added here.
const emptyListExamples = {
  empty: {
    summary: 'No records match — empty first page',
    value: { data: [] },
  },
}

function listOp(meta: OpMeta, params: object[] = baseListQueryParams) {
  return {
    tags: [meta.tag],
    operationId: meta.operationId,
    summary: meta.summary,
    description: meta.description,
    parameters: params,
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: listEnvelope(meta.schemaRef), examples: emptyListExamples } } },
      '400': errorResponse400,
      '401': errorResponse401,
      '501': errorResponse501,
    },
  }
}

function getOp(meta: OpMeta) {
  return {
    tags: [meta.tag],
    operationId: meta.operationId,
    summary: meta.summary,
    description: meta.description,
    parameters: [...getQueryParams, idPathParam],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: singleEnvelope(meta.schemaRef) } } },
      '400': errorResponse400,
      '401': errorResponse401,
      '404': errorResponse404,
      '501': errorResponse501,
    },
  }
}

const componentSchemas: Record<string, unknown> = {}
for (const [name, value] of Object.entries(schemas)) {
  if (!isZodSchema(value)) continue
  componentSchemas[name] = toSchema(value, name)
}
componentSchemas.ProjectSchema = toSchema(ProjectSchema, 'ProjectSchema')
componentSchemas.TaskSchema = toSchema(TaskSchema, 'TaskSchema')
componentSchemas.CommentSchema = toSchema(CommentSchema, 'CommentSchema')
componentSchemas.TagSchema = toSchema(TagSchema, 'TagSchema')
componentSchemas.WorkspaceSchema = toSchema(WorkspaceSchema, 'WorkspaceSchema')
componentSchemas.UserSchema = toSchema(UserSchema, 'UserSchema')

Object.assign(componentSchemas, buildSyncOpenapiSchemas())

const paths: Record<string, Record<string, unknown>> = {
  '/v1/projects': {
    get: listOp({
      tag: 'Projects',
      schemaRef: '#/components/schemas/ProjectSchema',
      operationId: 'listProjects',
      summary: 'List projects',
      description: 'Returns projects visible to the connection.',
    }),
  },
  '/v1/projects/{id}': {
    get: getOp({
      tag: 'Projects',
      schemaRef: '#/components/schemas/ProjectSchema',
      operationId: 'getProject',
      summary: 'Get project',
      description: 'Fetches a single project by id.',
    }),
  },
  '/v1/tasks': {
    get: listOp(
      {
        tag: 'Tasks',
        schemaRef: '#/components/schemas/TaskSchema',
        operationId: 'listTasks',
        summary: 'List tasks for a project',
        description:
          'Returns tasks under the given project. Use `metadata.platformType` to distinguish platform-specific levels (epic/story/subtask/etc.).',
      },
      [connectionIdParam, projectIdQueryParam, limitParam, pageParam, cursorParam],
    ),
  },
  '/v1/tasks/{id}': {
    get: getOp({
      tag: 'Tasks',
      schemaRef: '#/components/schemas/TaskSchema',
      operationId: 'getTask',
      summary: 'Get task',
      description: 'Fetches a single task by id.',
    }),
  },
  '/v1/comments': {
    get: listOp(
      {
        tag: 'Comments',
        schemaRef: '#/components/schemas/CommentSchema',
        operationId: 'listComments',
        summary: 'List comments for a task',
        description: 'Returns comments under the given task.',
      },
      [connectionIdParam, taskIdQueryParam, limitParam, pageParam, cursorParam],
    ),
  },
  '/v1/comments/{id}': {
    get: getOp({
      tag: 'Comments',
      schemaRef: '#/components/schemas/CommentSchema',
      operationId: 'getComment',
      summary: 'Get comment',
      description: 'Fetches a single comment by id.',
    }),
  },
  '/v1/tags': {
    get: listOp(
      {
        tag: 'Tags',
        schemaRef: '#/components/schemas/TagSchema',
        operationId: 'listTags',
        summary: 'List tags for a workspace',
        description: 'Returns tags in the given workspace.',
      },
      [connectionIdParam, workspaceIdQueryParam, limitParam, pageParam, cursorParam],
    ),
  },
  '/v1/tags/{id}': {
    get: getOp({
      tag: 'Tags',
      schemaRef: '#/components/schemas/TagSchema',
      operationId: 'getTag',
      summary: 'Get tag',
      description: 'Fetches a single tag by id.',
    }),
  },
  '/v1/workspaces': {
    get: listOp({
      tag: 'Workspaces',
      schemaRef: '#/components/schemas/WorkspaceSchema',
      operationId: 'listWorkspaces',
      summary: 'List workspaces',
      description: 'Returns workspaces visible to the connection.',
    }),
  },
  '/v1/workspaces/{id}': {
    get: getOp({
      tag: 'Workspaces',
      schemaRef: '#/components/schemas/WorkspaceSchema',
      operationId: 'getWorkspace',
      summary: 'Get workspace',
      description: 'Fetches a single workspace by id.',
    }),
  },
  '/v1/users': {
    get: listOp(
      {
        tag: 'Users',
        schemaRef: '#/components/schemas/UserSchema',
        operationId: 'listUsers',
        summary: 'List users for a workspace',
        description: 'Returns members of the given workspace. PII-minimal (name + email).',
      },
      [connectionIdParam, workspaceIdQueryParam, limitParam, pageParam, cursorParam],
    ),
  },
  '/v1/users/{id}': {
    get: getOp({
      tag: 'Users',
      schemaRef: '#/components/schemas/UserSchema',
      operationId: 'getUser',
      summary: 'Get user',
      description: 'Fetches a single user by id.',
    }),
  },

  '/webhooks/{platform}': {
    post: {
      tags: ['Webhooks'],
      summary: 'Receive a platform webhook',
      operationId: 'receiveProjectsWebhook',
      description: 'Verifies the incoming webhook signature and emits canonical `WebhookEvent`s.',
      parameters: [authPlatformParam],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
      },
      responses: {
        '200': { description: 'Webhook received and processed.' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '401': { description: 'Invalid webhook signature.' },
      },
    },
  },

  '/health': {
    get: {
      tags: [],
      summary: 'Liveness probe',
      operationId: 'projectsHealth',
      responses: {
        '200': {
          description: 'Service is up',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } } },
            },
          },
        },
      },
    },
  },
}

export function buildSpec(): Record<string, unknown> {
  const openapi = {
    openapi: '3.1.0',
    info: {
      title: 'Projects API',
      version: '0.1.0',
      license: { name: 'Elastic-2.0', url: 'https://github.com/open-steward/opensteward/blob/main/LICENSE' },
      description: `Unified REST API for project / task management platforms (Asana, Jira, Linear, Monday, ClickUp, Trello, Basecamp, Smartsheet, Microsoft Planner, Wrike, …).

## Hierarchy

Canonical schema uses **flat tasks with a \`parentId\` self-pointer**. Platform-specific level semantics (epic / story / subtask / sub-issue / subitem) live in \`Task.metadata.platformType\`. Operators querying without that field see a uniform shape across all platforms.

## Refused at the schema level

- **Attachment content (bytes)** — surface \`attachmentCount\` only.
- **Time-tracking entries** — not part of the projects schema.
- **User PII beyond name + email** — canonical User is PII-minimal.
- **Custom-field schemas** — values land in \`metadata\`; field-schema definitions not surfaced.

## Authentication

Every \`/v1/*\` request must include the \`connection_id\` query parameter — a UUID returned by the OAuth callback.

## Response envelopes

- **List:** \`{ data: T[] }\`
- **Single:** \`{ data: T }\`

## Unsupported operations

Unimplemented adapter operations return \`501 Not Implemented\`.
`,
    },
    servers: [
      { url: 'http://localhost:3010', description: 'Local (integration-server via docker compose)' },
    ],
    tags: [
      { name: 'Projects', description: 'Projects (workspaces containers of tasks).' },
      { name: 'Tasks', description: 'Tasks with flat-with-parent-pointer hierarchy.' },
      { name: 'Comments', description: 'Comments on tasks or projects. Text included; attachment content refused.' },
      { name: 'Tags', description: 'Taxonomy.' },
      { name: 'Workspaces', description: 'Top-level org boundary.' },
      { name: 'Users', description: 'Platform user identity (name + email only).' },
      { name: 'Auth', description: 'OAuth 2.0 flows.' },
      { name: 'Sync', description: 'Background full-sync job management at `/v1/projects/sync`.' },
      { name: 'Webhooks', description: 'Inbound platform webhook normalisation.' },
    ],
    paths,
    components: {
      schemas: componentSchemas,
      responses: {
        BadRequest: {
          description: 'Bad Request.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Unauthorized: {
          description: 'Unauthorized.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Forbidden: {
          description: 'Forbidden.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotFound: {
          description: 'Not Found.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotImplemented: {
          description: 'Not Implemented.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['error'],
                properties: {
                  error: { type: 'string' },
                  code: { type: 'string', enum: ['NOT_IMPLEMENTED'] },
                },
              },
            },
          },
        },
      },
    },
  }

  return openapi
}
