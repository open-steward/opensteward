/** OData $select strings for each entity */
export const SELECT = {
  CONTACT: 'Id,FirstName,LastName,Email,Phone,JobTitle,AccountId,OwnerId',
  ACCOUNT: 'Id,Name,Web,Phone,OwnerId',
  OPPORTUNITY: 'Id,Title,Amount,CloseDate,StageId,AccountId,OwnerId,Probability',
  OPPORTUNITY_STAGE: 'Id,Name,Number',
  ACTIVITY: 'Id,Title,Notes,DueDate,OwnerId,ContactId',
} as const
