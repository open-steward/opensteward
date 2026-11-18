import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'

export const TemplateSchema = z.object({
  id: z.string().meta({ example: 'tmpl_msa' }),
  externalId: z.string().meta({ example: 'tmpl_msa' }),
  name: z.string().meta({ example: 'Master Services Agreement' }),
  description: z.string().optional().meta({ example: 'Standard MSA template for new customers' }),
  signerRoles: z.array(z.string()).describe('Role names defined on the template.').meta({ example: ['Signer'] }),
  documentCount: z.number().int().min(0).meta({ example: 1 }),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  platform: z.string().meta({ example: 'docusign' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Template = z.infer<typeof TemplateSchema>
