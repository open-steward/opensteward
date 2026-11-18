export const metadata = {
  platform: 'agiloft',
  totalResources: 5,
  availableResources: ['envelope'],
  unavailableResources: [
    {
      resource: 'signer',
      reason:
        'Agiloft CLM stores signer information as embedded fields within the Contracts table record, not as discrete signer records in a dedicated REST-queryable table. No standard /signers or equivalent table exists in a generic Agiloft KB.',
    },
    {
      resource: 'template',
      reason:
        'UNVERIFIED: Agiloft has a Document Templates table (Word/PDF generation templates), but the full REST documentation is behind authentication. Even if accessible, these are document-generation templates rather than signing workflow templates and do not carry signerRoles or documentCount fields required by the canonical Template schema.',
    },
    {
      resource: 'audit-trail-entry',
      reason:
        'Record history is "a special embedded table data type" (https://help.agiloft.com/space/HELP/43716066) and no REST operation reads it (https://help.agiloft.com/space/HELP/43715778)',
    },
    {
      resource: 'document',
      reason:
        'Contract files are records of the Attachments table, whose logical table name the public REST docs do not give, and EWAttachInfo only "returns information about the attachments of a record in a particular field" (https://help.agiloft.com/space/HELP/43715898)',
    },
  ],
} as const
