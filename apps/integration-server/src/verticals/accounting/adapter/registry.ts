/**
 * Re-export the shared AdapterRegistry, typed for AccountingAdapter.
 */
import { AdapterRegistry } from '@opensteward/shared'
import type { AccountingAdapter } from './interface'

export { AdapterRegistry }
export type AccountingAdapterRegistry = AdapterRegistry<AccountingAdapter>
