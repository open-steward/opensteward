import { z } from 'zod'

export const TagSchema = z.object({
  id: z.string().meta({ example: 'tag_onboarding' }),
  externalId: z.string().meta({ example: 'tag_onboarding' }),
  workspaceId: z.string().meta({ example: 'ws_acme' }),
  name: z.string().meta({ example: 'Phase 1 — Setup' }),
  color: z.string().optional().meta({ example: '#4f46e5' }),
  platform: z.string().meta({ example: 'asana' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Tag = z.infer<typeof TagSchema>
