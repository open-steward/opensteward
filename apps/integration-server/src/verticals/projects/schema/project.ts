import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'
import { ProjectStatusSchema } from './shared'

export const ProjectSchema = z.object({
  id: z.string().meta({ example: 'proj_1042' }),
  externalId: z.string().meta({ example: 'proj_1042' }),
  workspaceId: z.string().meta({ example: 'ws_acme' }),
  name: z.string().meta({ example: 'Acme Onboarding' }),
  description: z.string().optional().meta({ example: 'Onboard Acme Industries onto the platform.' }),
  status: ProjectStatusSchema.meta({ example: 'active' }),
  ownerId: z.string().optional().meta({ example: 'usr_jane' }),
  startDate: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  endDate: IsoDatetime.optional().meta({ example: '2026-02-15T17:00:00Z' }),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  platform: z.string().meta({ example: 'asana' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Project = z.infer<typeof ProjectSchema>
