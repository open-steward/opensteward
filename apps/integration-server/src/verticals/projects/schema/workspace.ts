import { z } from 'zod'

export const WorkspaceSchema = z.object({
  id: z.string().meta({ example: 'ws_acme' }),
  externalId: z.string().meta({ example: 'ws_acme' }),
  name: z.string().meta({ example: 'Acme Industries' }),
  memberCount: z.number().int().min(0).optional().meta({ example: 12 }),
  platform: z.string().meta({ example: 'asana' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Workspace = z.infer<typeof WorkspaceSchema>
