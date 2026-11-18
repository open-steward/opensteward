/**
 * Canonical schema barrel for the projects vertical.
 */

export { ProjectStatusSchema, TaskStatusSchema, TaskPrioritySchema } from './shared'
export type { ProjectStatus, TaskStatus, TaskPriority } from './shared'

export { ProjectSchema } from './project'
export type { Project } from './project'

export { TaskSchema } from './task'
export type { Task } from './task'

export { CommentSchema } from './comment'
export type { Comment } from './comment'

export { TagSchema } from './tag'
export type { Tag } from './tag'

export { WorkspaceSchema } from './workspace'
export type { Workspace } from './workspace'

export { UserSchema } from './user'
export type { User } from './user'

export { WebhookEventSchema, WebhookResourceTypeSchema, WebhookActionSchema } from './webhook'
export type { WebhookEvent, WebhookResourceType, WebhookAction } from './webhook'
