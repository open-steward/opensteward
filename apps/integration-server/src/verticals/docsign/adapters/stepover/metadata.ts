export const metadata = {
  platform: 'stepover',
  totalResources: 5,
  availableResources: ['envelope'],
  unavailableResources: [
    {
      resource: 'audit-trail-entry',
      reason:
        'The StepOver Tyr XML-RPC web service exposes no audit-trail endpoint; the API is intentionally narrow (get/delete by document id only).',
    },
    {
      resource: 'document',
      reason:
        'The Tyr API has no document-metadata endpoint; retrieveXml returns the signed PDF content which the docsign schema firewall forbids surfacing.',
    },
    {
      resource: 'signer',
      reason:
        'The Tyr API has no recipient or signer-read endpoint; signer identity is not queryable via any Tyr method.',
    },
    {
      resource: 'template',
      reason:
        'The StepOver Tyr web service has no template concept or endpoint; webSignatureOffice templates are not accessible via the API.',
    },
  ],
} as const
