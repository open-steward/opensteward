export const metadata = {
  platform: 'ironclad',
  totalResources: 5,
  availableResources: ['envelope', 'signer', 'document'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'Ironclad has no REST endpoint to read audit-trail events. The /workflows/{id}/turn-history endpoint tracks workflow ownership turns (not signing events). Audit log data is available only via SIEM streaming (Security & Data Pro add-on); there is no per-workflow or global audit-event read API.',
    },
    {
      resource: 'template',
      reason:
        'Ironclad has no public REST endpoint to list or retrieve document templates. The /workflow-schemas endpoint returns workflow launch-form schemas (field definitions), not reusable signing template definitions. No template resource exists in the Ironclad Public API v1.',
    },
  ],
} as const
