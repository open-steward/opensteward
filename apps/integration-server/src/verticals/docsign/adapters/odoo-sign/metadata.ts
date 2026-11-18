export const metadata = {
  platform: 'odoo-sign',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'document', 'template'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        "Odoo publishes no audit-log model for Sign: the app is Enterprise-only, its source is not public, and neither the External API pages nor Odoo's own published Sign data name a model that holds a request's signing history.",
    },
  ],
} as const
