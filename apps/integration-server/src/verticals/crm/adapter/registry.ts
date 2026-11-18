/**
 * Re-export the shared AdapterRegistry, typed for CrmAdapter.
 */
import { AdapterRegistry } from '@opensteward/shared'
import type { CrmAdapter } from './interface'

export { AdapterRegistry }
export type CrmAdapterRegistry = AdapterRegistry<CrmAdapter>
