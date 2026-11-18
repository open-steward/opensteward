/**
 * Re-export the shared AdapterRegistry, typed for EcommerceAdapter.
 */
import { AdapterRegistry } from '@opensteward/shared'
import type { EcommerceAdapter } from './interface'

export { AdapterRegistry }
export type EcommerceAdapterRegistry = AdapterRegistry<EcommerceAdapter>
