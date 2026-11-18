import { z } from 'zod'

/**
 * Document — file attached to an envelope. Filename + size only.
 *
 * Content is REFUSED at the schema level. There is no `content`, no `url`,
 * no `previewUrl`. Contracts can hold attorney-client privilege, Art 9
 * special-category data, or financial settlements; the schema's absence
 * of a body field is the firewall.
 */
export const DocumentSchema = z.object({
  id: z.string().meta({ example: 'doc_msa' }),
  externalId: z.string().meta({ example: 'doc_msa' }),
  envelopeId: z.string().meta({ example: 'env_1042' }),
  name: z.string().meta({ example: 'Master Services Agreement.pdf' }),
  sizeBytes: z.number().int().min(0).optional().meta({ example: 248320 }),
  pageCount: z.number().int().min(0).optional().meta({ example: 12 }),
  mimeType: z.string().optional().describe('e.g. application/pdf').meta({ example: 'application/pdf' }),
  order: z.number().int().min(0).describe('Position within the envelope; 0-indexed.').meta({ example: 0 }),
  platform: z.string().meta({ example: 'docusign' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Document = z.infer<typeof DocumentSchema>
