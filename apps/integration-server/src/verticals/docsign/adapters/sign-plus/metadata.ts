export const metadata = {
  platform: 'sign-plus',
  totalResources: 5,
  availableResources: ['document', 'envelope', 'signer', 'template'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'Sign.Plus has no list/get audit endpoint. Audit activity is delivered only via the ENVELOPE_AUDIT_TRAIL webhook event; there is no REST surface to pull audit trail entries.',
    },
  ],
} as const
