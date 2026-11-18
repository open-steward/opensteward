/**
 * Fixtures shaped on the 200-response examples of the Sage CRM 2024 R2
 * RESTful API reference (components.schemas Person, Company, Opportunity,
 * Communication, Notes, Email, Phone, Address). Key names and casing are the
 * documented ones; the reference's placeholder values ("string", 0,
 * "2019-08-24T14:15:22Z") are replaced by realistic ones of the same type.
 */

export function person(id: number): Record<string, unknown> {
  return {
    Pers_PersonId: id,
    Pers_FirstName: 'Jim',
    Pers_LastName: `Browne ${id}`,
    Pers_Title: 'Purchasing Manager',
    Pers_CompanyId: 41,
    Pers_PrimaryuserId: '4',
    Pers_PrimaryAddressId: 900 + id,
    Pers_CreatedDate: '2019-08-24T14:15:22Z',
    Pers_UpdatedDate: '2019-08-25T09:00:00Z',
    Pers_Deleted: 0,
    Email: [
      {
        Emai_EmailId: 70 + id,
        Emai_EmailAddress: 'jim.browne@gatecom.example',
        Emai_Deleted: 0,
        $type: 'string',
      },
    ],
    Phone: [
      {
        Phon_PhoneId: 80 + id,
        Phon_CountryCode: '44',
        Phon_AreaCode: '20',
        Phon_number: '7946 0000',
      },
    ],
    Address: [
      { Addr_AddressId: 1, addr_address1: 'Other Street 1', Addr_City: 'Leeds' },
      {
        Addr_AddressId: 900 + id,
        addr_address1: '1 Main Street',
        addr_address2: 'Floor 2',
        Addr_City: 'London',
        Addr_State: 'Greater London',
        Addr_PostCode: 'EC1A 1BB',
        Addr_Country: 'UK',
        $isDefault: true,
      },
    ],
  }
}

export function company(id: number): Record<string, unknown> {
  return {
    Comp_CompanyId: id,
    Comp_Name: `Eurolandia ${id}`,
    Comp_PrimaryUserId: '1',
    Comp_PrimaryAddressId: 500 + id,
    Comp_CreatedDate: '2019-08-24T14:15:22Z',
    Comp_UpdatedDate: '2019-08-26T10:00:00Z',
    Comp_Website: 'http://www.eurolandia.example',
    Comp_Sector: 'Hardware',
    Email: [
      { Emai_EmailId: 1, Emai_EmailAddress: 'sales@eurolandia.example' },
      { Emai_EmailId: 2, Emai_EmailAddress: 'info@eurolandia.example' },
    ],
    Phone: [
      { Phon_PhoneId: 3, Phon_CountryCode: '353', Phon_AreaCode: '1', Phon_number: '555 0100' },
    ],
    Address: [{ Addr_AddressId: 500 + id, addr_address1: '9 Quay Road', Addr_City: 'Dublin' }],
  }
}

export function opportunity(id: number): Record<string, unknown> {
  return {
    Oppo_OpportunityId: id,
    Oppo_Description: `Server upgrade ${id}`,
    Oppo_Note: 'Upgrade of 20 servers',
    Oppo_AssignedUserId: '4',
    Oppo_Status: 'In Progress',
    Oppo_Stage: 'Negotiating',
    Oppo_PrimaryCompanyId: 41,
    Oppo_PrimaryPersonId: 55,
    Oppo_Forecast: 12000.5,
    Oppo_Forecast_CID: '1',
    Oppo_Certainty: 60,
    oppo_targetclose: '2020-03-31T00:00:00Z',
    Oppo_CreatedDate: '2019-08-24T14:15:22Z',
    Oppo_UpdatedDate: '2019-09-01T08:00:00Z',
  }
}

export function communication(id: number): Record<string, unknown> {
  // Values from the reference's batch request example: "Comm_Type": "task",
  // "Comm_organizer": "1", "Comm_Status": "Pending". The key below uses the
  // components.schemas.Communication casing, comm_organizer, which is the
  // field the transform reads.
  return {
    Comm_CommunicationId: id,
    Comm_Type: 'task',
    Comm_Subject: `My task ${id}`,
    comm_note: 'Call back about the quote',
    comm_organizer: '1',
    Comm_Status: 'Pending',
    Comm_Action: 'ToDo',
    comm_datetime: '2020-10-06T08:30:00+01:00',
    Comm_OpportunityId: 12,
    Comm_CreatedDate: '2020-10-01T08:00:00Z',
    Comm_UpdatedDate: '2020-10-02T08:00:00Z',
  }
}

export function note(id: number): Record<string, unknown> {
  // Values from the reference's batch response example:
  // "Note_Note": "Demo note 1", "Note_ForeignTableId": 5, "Note_ForeignId": 41.
  return {
    Note_NoteId: id,
    Note_Note: `Demo note ${id}`,
    Note_ForeignTableId: 5,
    Note_ForeignId: 41,
    Note_CreatedBy: '1',
    Note_CreatedDate: '2020-10-01T08:00:00Z',
    Note_UpdatedDate: '2020-10-03T08:00:00Z',
  }
}
