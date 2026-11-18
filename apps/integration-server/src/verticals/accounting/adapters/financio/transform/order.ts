import type { Order } from '../../../schema/order'

// Financio does not support orders — this is a stub module.
// The adapter does not implement listOrders/getOrder so 501 is returned automatically.

// This empty export satisfies the module requirement while making
// the intentional omission explicit.
export type FinancioOrder = Record<string, unknown>

export function transformOrder(_raw: FinancioOrder): Order {
  throw new Error('Orders are not supported by the Financio adapter')
}
