export const metadata = {
  platform: 'lleida-net',
  totalResources: 5,
  availableResources: [
    'audit-trail-entry',
    'document',
    'envelope',
    'signer',
  ],
  unavailableResources: [
    {
      resource: 'template',
      reason:
        'Click & Sign has no document-template resource. GET_CONFIG / GET_CONFIG_LIST return branding and callback workflow configurations, not reusable templates with signer roles or document attachments. The landing_template and body_template fields are opaque string references managed externally by Lleida.net support, not queryable template objects.',
    },
  ],
} as const
