export const metadata = {
  platform: 'decentro',
  totalResources: 10,
  availableResources: ['charge', 'refund', 'payout'],
  unavailableResources: [
    {
      resource: 'balance-transaction',
      reason: 'UNVERIFIED: Decentro has a virtual-account statement endpoint (/core_banking/money_transfer/get_statement) but its response field names could not be confirmed from public documentation',
    },
    {
      resource: 'customer',
      reason: 'Decentro has no customer object; payers are identified only by UPI VPA or consumer URN at request time',
    },
    {
      resource: 'dispute',
      reason: 'Decentro has no dispute or chargeback endpoint in its payments API',
    },
    {
      resource: 'invoice',
      reason: 'Decentro is not a billing platform and has no invoice endpoint',
    },
    {
      resource: 'payment-method',
      reason: 'Decentro is UPI/bank-transfer only; it has no stored payment method concept',
    },
    {
      resource: 'plan',
      reason: 'Decentro has no subscription plan management endpoint',
    },
    {
      resource: 'subscription',
      reason: 'Decentro has no subscription management endpoint',
    },
  ],
} as const
