export const metadata = {
  platform: 'sysaid',
  totalResources: 7,
  availableResources: ['contact', 'message', 'team', 'ticket', 'user'],
  unavailableResources: [
    {
      resource: 'tag',
      reason: 'SysAid Connect API v1 has no tags or label endpoint (confirmed via developers.sysaid.com API reference)',
    },
    {
      resource: 'macro',
      reason: 'SysAid Connect API v1 has no macros or canned-response endpoint (confirmed via developers.sysaid.com API reference)',
    },
  ],
} as const
