import type { PaymentMethod } from '../../../schema/payment-method'
import { requireId, str } from './shared'

/**
 * Payment Method resource (https://killbill.github.io/slate/payment-method.html):
 * paymentMethodId, externalKey, accountId, isDefault, pluginName, pluginInfo.
 * Card or bank details live in `pluginInfo.properties`, whose keys "are
 * dependent on the payment method, but they are also dependent on the third
 * party payment gateway", so none are read and the type is not known.
 */
export interface RawKillbillPaymentMethod {
  paymentMethodId?: string
  externalKey?: string | null
  accountId?: string | null
  isDefault?: boolean | null
  pluginName?: string | null
  [k: string]: unknown
}

export function transformPaymentMethod(raw: RawKillbillPaymentMethod): PaymentMethod {
  const id = requireId(raw.paymentMethodId, 'paymentMethodId', 'payment method')
  return {
    id,
    externalId: id,
    ...(str(raw.accountId) ? { customerId: raw.accountId as string } : {}),
    type: 'unknown',
    ...(typeof raw.isDefault === 'boolean' ? { isDefault: raw.isDefault } : {}),
    gateway: 'killbill',
    metadata: str(raw.pluginName) ? { pluginName: raw.pluginName as string } : {},
    raw,
  }
}
