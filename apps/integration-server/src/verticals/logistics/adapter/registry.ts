/**
 * Re-export the shared AdapterRegistry, typed for LogisticsAdapter.
 */
import { AdapterRegistry } from '@opensteward/shared'
import type { LogisticsAdapter } from './interface'

export { AdapterRegistry }
export type LogisticsAdapterRegistry = AdapterRegistry<LogisticsAdapter>
