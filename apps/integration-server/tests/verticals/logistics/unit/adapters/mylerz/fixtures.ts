/**
 * Fixtures copied from the JSON samples on Mylerz's ASP.NET help pages
 * (https://integration.mylerz.net/Help/Api/...), fetched 2026-09-24. Only
 * identifying values are changed, so rows can be told apart.
 */

const LOOKUP = {
  Id: 1,
  Code: 'sample string 2',
  ArName: 'sample string 3',
  EnName: 'sample string 4',
}

/** One warehouseDTO, from GET-api-Orders-GetWarehouses. */
export function docWarehouse(name = 'sample string 3') {
  return {
    MerchantName: 'sample string 1',
    MerchantId: 2,
    Name: name,
    Zone: { ...LOOKUP },
    ZoneId: 4,
    SubZone: { ...LOOKUP },
    SubZoneId: 5,
    hubs: [{ ...LOOKUP }, { ...LOOKUP }],
    Latitude: 6.1,
    Longitude: 7.1,
    Address: 'sample string 8',
    PhoneNumber: 'sample string 9',
    ContactName: 'sample string 10',
    PickupTWFrom: 'sample string 11',
    PickupTWTo: 'sample string 12',
    PackageServiceTime: 13,
    HasSorting: true,
  }
}

/** DescriptiveResponseOf... envelope around `value`, with no error. */
export function envelope<T>(value: T) {
  return {
    Value: value,
    CoreValue: 'sample string 1',
    IsErrorState: false,
    ErrorDescription: null,
    ErrorMetadata: {},
  }
}

/** PackageDetailsResponseDTO, from GET-api-packages-GetPackageDetails_AWB (Pieces/Documents trimmed to one). */
export function docPackageDetails(barcode = 'sample string 1') {
  return {
    Barcode: barcode,
    Description: 'sample string 2',
    PiecesCount: 3,
    TotalWeight: 4.1,
    ServiceType: 'sample string 5',
    ServiceDate: '2026-09-24T22:42:41.0171165+03:00',
    Service: 'sample string 7',
    ServiceCategory: 'sample string 8',
    CustomerName: 'sample string 9',
    DeliveryCost: 10.0,
    MobileNo: 'sample string 11',
    CustomerAddress: 'sample string 12',
    BuildingNo: 'sample string 13',
    FloorNo: 'sample string 14',
    Street: 'sample string 15',
    ApartmentNo: 'sample string 16',
    CityName: 'sample string 17',
    Neighborhood: 'sample string 18',
    SubZoneName: 'sample string 19',
    AddressCategory: 'sample string 20',
    Status: 'sample string 21',
    ReferenceNumber: 'sample string 22',
    ReferenceNumber2: 'sample string 23',
    CustomerReferenceNumber: 'sample string 24',
    Pieces: [
      {
        pieceNo: 1,
        Weight: 'sample string 2',
        ItemCategory: 'sample string 3',
        SpecialNotes: 'sample string 4',
        Dimensions: 'sample string 5',
        PieceReferenceNumber: 'sample string 6',
        HSTariffCode: 'sample string 7',
        ItemValue: 8.0,
        Quantity: 1,
      },
    ],
    Documents: [
      {
        PathName: 'sample string 1',
        DocumentName: 'sample string 2',
        DocumentId: 1,
        DocumentContent: 'sample string 3',
        ContentType: 'sample string 4',
        PersistanceInstruction: 0,
      },
    ],
    ErrorMessage: 'sample string 25',
  }
}

const CALL = {
  PhoneNo: 'sample string 1',
  Text: 'sample string 2',
  time: '2026-09-24T16:23:33.0342167+03:00',
  MemberId: 4,
  MemberName: 'sample string 5',
  CategoryId: 6,
  Duration: 'sample string 7',
  CallStatusId: 8,
  CallStatus: 'sample string 9',
}

/** One PackageStatusLog entry, from GET-api-packages-GetPackageTrackingDetailsByBarCode_barcode. */
export function docStatusLog(statusId = 1, changedDate = '2026-09-24T16:23:33.0342167+03:00') {
  return {
    StatusId: statusId,
    StatusArName: 'sample string 2',
    StatusEnName: 'sample string 3',
    StatusBusId: 4,
    StatusBusArName: 'sample string 5',
    StatusBusEnName: 'sample string 6',
    StatusColor: 'sample string 7',
    PackageId: 8,
    ChangedDate: changedDate,
    smsList: [{ ...CALL }],
    CallList: [{ ...CALL }],
    collapse: true,
  }
}

/** TrackingDTO (PackageListTracking and PackageTrackingShipmentDetails trimmed). */
export function docTracking(
  logs = [docStatusLog(1), docStatusLog(2, '2026-09-25T10:00:00+03:00')],
) {
  return {
    PackageListTracking: {
      PackageId: 1,
      Barcode: 'sample string 2',
      PackageENStatus: 'sample string 8',
    },
    PackageTrackingShipmentDetails: { PackageId: 1, Barcode: 'sample string 2' },
    PackageStatusLog: logs,
  }
}
