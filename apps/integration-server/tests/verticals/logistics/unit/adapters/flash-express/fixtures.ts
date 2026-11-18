/**
 * Fixtures copied from the response body examples at
 * https://open-docs.flashexpress.com/ (fetched 2026-09-24).
 */
import type { FlashExpressWarehouse } from '../../../../../../src/verticals/logistics/adapters/flash-express/transform/warehouse'
import type { FlashExpressRoutesData } from '../../../../../../src/verticals/logistics/adapters/flash-express/transform/tracking'

/** getAllWarehouses, POST /open/v1/warehouses: the two rows of the example `data`. */
export function docWarehouses(): FlashExpressWarehouse[] {
  return [
    {
      warehouseNo: 'AAXXXX_001',
      name: 'AAXXXX_001',
      countryName: 'Thailand',
      provinceName: 'อุบลราชธานี',
      cityName: 'เมืองอุบลราชธานี',
      districtName: 'แจระแม',
      postalCode: '34000',
      detailAddress: '68/5-6 ม.1 บ้านท่าบ่อ',
      phone: '0123456789',
      srcName: 'หอมรวม',
    },
    {
      warehouseNo: 'AAXXXX_002',
      name: 'AAXXXX_002',
      countryName: 'Thailand',
      provinceName: 'กรุงเทพ',
      cityName: 'บางแค',
      districtName: 'บางแค',
      postalCode: '10160',
      detailAddress: '11/369 ซ.53 หมู่ 7 ถ.กาญจนาภิเษก',
      phone: '0123456789',
      srcName: 'เอกรินทร์',
    },
  ]
}

/** A warehouse row shaped like the example, with a chosen warehouse No. */
export function docWarehouseRow(warehouseNo: string): FlashExpressWarehouse {
  return { ...docWarehouses()[0]!, warehouseNo, name: warehouseNo }
}

/** Tracking order, POST /open/v1/orders/{pno}/routes: the example `data`. */
export function docRoutes(): FlashExpressRoutesData {
  return {
    pno: 'TH0112XXXXXX',
    origPno: 'TH0112XXXXXX',
    returnedPno: 'TH0112XXXXXX1',
    customaryPno: null,
    state: 5,
    stateText: 'เซ็นรับแล้ว',
    stateChangeAt: 1523356029,
    routes: [
      {
        routedAt: 1523357001,
        routeAction: 'DELIVERY_CONFIRM',
        message: 'พัสดุของคุณถูกเซ็นรับแล้ว เซ็นรับโดย TH0112XXXXXX',
        state: 1,
      },
      {
        routedAt: 1523356924,
        routeAction: 'DELIVERY_TICKET_CREATION_SCAN',
        message: 'มีพัสดุรอการนำส่ง กรุณารอการติดต่อจากเจ้าหน้าที่ Flash Express',
        state: 2,
      },
      {
        routedAt: 1523356560,
        routeAction: 'SHIPMENT_WAREHOUSE_SCAN',
        message: 'พัสดุของคุณอยู่ที่ กทม. จะถูกส่งไปยัง จตุโชติ-DC',
        state: 3,
      },
      {
        routedAt: 1523356029,
        routeAction: 'RECEIVED',
        message: 'zhao=DC พนักงานเข้ารับพัสดุแล้ว',
        state: 5,
      },
    ],
  }
}
