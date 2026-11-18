export const metadata = {
  platform: 'e-signature-eu',
  totalResources: 5,
  availableResources: ['document', 'envelope', 'signer'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'e-Signature.eu generates an audit trail per request but exposes it only as a downloadable PDF from the dashboard; no REST endpoint exists to query audit events programmatically.',
    },
    {
      resource: 'template',
      reason:
        'e-Signature.eu has no template management concept; the API supports only ad-hoc signature requests (request, list, getRequest, skip, remind, cancel, delete).',
    },
  ],
} as const
