/**
 * Re-export the shared AdapterRegistry, typed for DocsignAdapter.
 */
import { AdapterRegistry } from '@opensteward/shared'
import type { DocsignAdapter } from './interface'

export { AdapterRegistry }
export type DocsignAdapterRegistry = AdapterRegistry<DocsignAdapter>
