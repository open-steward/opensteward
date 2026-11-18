import type { Pipeline } from '../../../schema/pipeline'

/** Wix CRM has no pipeline concept. This transform is a stub. */
export function transformPipeline(_raw: unknown): Pipeline {
  throw new Error('not implemented')
}
