/**
 * Re-export the shared AdapterRegistry, typed for PaymentsAdapter.
 */
import { AdapterRegistry } from '@opensteward/shared'
import type { PaymentsAdapter } from './interface'

export { AdapterRegistry }
export type PaymentsAdapterRegistry = AdapterRegistry<PaymentsAdapter>
