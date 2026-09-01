import type { ReactNode } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import FlashPopup from './components/FlashPopup'
import RequireAuth from './components/RequireAuth'
import RoleRoute from './components/RoleRoute'
import BackOfficePage from './pages/BackOfficePage'
import CrmPage from './pages/CrmPage'
import CompanyDetailsPage from './pages/CompanyDetailsPage'
import DepartmentsPage from './pages/DepartmentsPage'
import DeliveryPage from './pages/DeliveryPage'
import DeliveryIntegrationsPage from './pages/DeliveryIntegrationsPage'
import DeliveryRidersPage from './pages/DeliveryRidersPage'
import DineInPage from './pages/DineInPage'
import ExpenseDetailsPage from './pages/ExpenseDetailsPage'
import ExpenseTypesPage from './pages/ExpenseTypesPage'
import GiftCardsPage from './pages/GiftCardsPage'
import FoodVouchersPage from './pages/FoodVouchersPage'
import DatabaseBackupPage from './pages/DatabaseBackupPage'
import DatabaseCleanPage from './pages/DatabaseCleanPage'
import DatabaseExportPage from './pages/DatabaseExportPage'
import DatabaseImportPage from './pages/DatabaseImportPage'
import HomePage from './pages/HomePage'
import IngredientMasterPage from './pages/IngredientMasterPage'
import RecipeUsagePage from './pages/RecipeUsagePage'
import InventoryPage from './pages/InventoryPage'
import KitchenPage from './pages/KitchenPage'
import MastersPage from './pages/MastersPage'
import OnlinePage from './pages/OnlinePage'
import PaymentsPage from './pages/PaymentsPage'
import PaymentTypesPage from './pages/PaymentTypesPage'
import ProductsPage from './pages/ProductsPage'
import PurchaseOrdersPage from './pages/PurchaseOrdersPage'
import QuickServePage from './pages/QuickServePage'
import DriveThruPage from './pages/DriveThruPage'
import SettingsPage from './pages/SettingsPage'
import StockReceivingPage from './pages/StockReceivingPage'
import StockTransferPage from './pages/StockTransferPage'
import FloorTablesMasterPage from './pages/FloorTablesMasterPage'
import StorageLocationsMasterPage from './pages/StorageLocationsMasterPage'
import YieldConversionsMasterPage from './pages/YieldConversionsMasterPage'
import SuppliersPage from './pages/SuppliersPage'
import TakeawayPage from './pages/TakeawayPage'
import TaxPage from './pages/TaxPage'
import TaxUpdatePage from './pages/TaxUpdatePage'
import DiscountPage from './pages/DiscountPage'
import ExtraChargesPage from './pages/ExtraChargesPage'
import RiderAppPage from './pages/RiderAppPage'
import CourierPickupPage from './pages/CourierPickupPage'
import PrintersPage from './pages/PrintersPage'
import UnitsPage from './pages/UnitsPage'
import UsersPage from './pages/UsersPage'
import RolesPage from './pages/RolesPage'
import VendorsPage from './pages/VendorsPage'
import MenuTimetablePage from './pages/MenuTimetablePage'
import DeveloperPortalPage from './pages/DeveloperPortalPage'
import { I18nProvider } from './locale/i18n'
import { AuthProvider } from './state/AuthContext'
import { BranchProvider } from './state/BranchContext'
import { CatalogProvider } from './state/CatalogContext'
import { CrmProvider } from './state/CrmContext'
import { FoodVoucherProvider } from './state/FoodVoucherContext'
import { MastersProvider } from './state/MastersContext'
import { PosProvider } from './state/PosContext'
import { PurchasingProvider } from './state/PurchasingContext'
import { ShiftProvider } from './state/ShiftContext'
import { SyncProvider } from './sync/SyncContext'

function Guard({ children }: { children: ReactNode }) {
  return <RoleRoute>{children}</RoleRoute>
}

const Router = /electron/i.test(navigator.userAgent) ? HashRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <I18nProvider>
        <AuthProvider>
          <BranchProvider>
            <SyncProvider>
              <MastersProvider>
                <CrmProvider>
                  <FoodVoucherProvider>
                  <CatalogProvider>
                  <PosProvider>
                    <PurchasingProvider>
                      <ShiftProvider>
                        <Routes>
                          <Route path="/developer" element={<DeveloperPortalPage />} />
                          <Route element={<RequireAuth />}>
                            <Route element={<AppShell />}>
                              <Route path="/" element={<Guard><HomePage /></Guard>} />
                              <Route path="/dine-in" element={<Guard><DineInPage /></Guard>} />
                              <Route path="/payments" element={<Guard><PaymentsPage /></Guard>} />
                              <Route path="/takeaway" element={<Guard><TakeawayPage /></Guard>} />
                              <Route path="/quick-serve" element={<Guard><QuickServePage /></Guard>} />
                              <Route path="/drive-thru" element={<Guard><DriveThruPage /></Guard>} />
                              <Route path="/delivery" element={<Guard><DeliveryPage /></Guard>} />
                              <Route path="/rider" element={<Guard><RiderAppPage /></Guard>} />
                              <Route path="/courier" element={<Guard><CourierPickupPage /></Guard>} />
                              <Route path="/online" element={<Guard><OnlinePage /></Guard>} />
                              <Route path="/kitchen" element={<Guard><KitchenPage /></Guard>} />
                              <Route path="/settings/ingredients/list" element={<Guard><IngredientMasterPage /></Guard>} />
                              <Route path="/settings/ingredients/usage" element={<Guard><RecipeUsagePage /></Guard>} />
                              <Route path="/inventory" element={<Guard><InventoryPage /></Guard>} />
                              <Route path="/suppliers" element={<Guard><SuppliersPage /></Guard>} />
                              <Route path="/purchase-orders" element={<Guard><PurchaseOrdersPage /></Guard>} />
                              <Route path="/crm" element={<Guard><CrmPage /></Guard>} />
                              <Route path="/masters" element={<Guard><MastersPage /></Guard>} />
                              <Route path="/settings" element={<Guard><SettingsPage /></Guard>} />
                              <Route path="/settings/company" element={<Guard><CompanyDetailsPage /></Guard>} />
                              <Route path="/settings/customers" element={<Guard><CrmPage /></Guard>} />
                              <Route path="/settings/gift-cards" element={<Guard><GiftCardsPage /></Guard>} />
                              <Route path="/settings/food-vouchers" element={<Guard><FoodVouchersPage /></Guard>} />
                              <Route path="/settings/menu-timetable" element={<Guard><MenuTimetablePage /></Guard>} />
                              <Route path="/settings/floor" element={<Guard><FloorTablesMasterPage /></Guard>} />
                              <Route path="/settings/database" element={<Navigate to="/settings?tab=database" replace />} />
                              <Route path="/settings/database/export" element={<Guard><DatabaseExportPage /></Guard>} />
                              <Route path="/settings/database/import" element={<Guard><DatabaseImportPage /></Guard>} />
                              <Route path="/settings/database/backup" element={<Guard><DatabaseBackupPage /></Guard>} />
                              <Route path="/settings/database/clean" element={<Guard><DatabaseCleanPage /></Guard>} />
                              <Route path="/settings/tax" element={<Guard><TaxPage /></Guard>} />
                              <Route path="/settings/tax-update" element={<Guard><TaxUpdatePage /></Guard>} />
                              <Route path="/settings/discount" element={<Guard><DiscountPage /></Guard>} />
                              <Route path="/settings/extra-charges" element={<Guard><ExtraChargesPage /></Guard>} />
                              <Route path="/settings/printers" element={<Guard><PrintersPage /></Guard>} />
                              <Route path="/settings/delivery-riders" element={<Guard><DeliveryRidersPage /></Guard>} />
                              <Route path="/settings/delivery-integrations" element={<Guard><DeliveryIntegrationsPage /></Guard>} />
                              <Route path="/settings/notifications" element={<Guard><DeliveryIntegrationsPage /></Guard>} />
                              <Route path="/settings/units" element={<Guard><UnitsPage /></Guard>} />
                              <Route path="/settings/users" element={<Guard><UsersPage /></Guard>} />
                              <Route path="/settings/roles" element={<Guard><RolesPage /></Guard>} />
                              <Route path="/settings/menu-details" element={<Guard><ProductsPage /></Guard>} />
                              <Route path="/settings/products" element={<Navigate to="/settings/menu-details" replace />} />
                              <Route path="/settings/departments" element={<Guard><DepartmentsPage /></Guard>} />
                              <Route path="/settings/accounts/payment-types" element={<Navigate to="/expenses/payment-types" replace />} />
                              <Route path="/settings/accounts/expense-types" element={<Navigate to="/expenses/types" replace />} />
                              <Route path="/settings/accounts/expense-details" element={<Navigate to="/expenses" replace />} />
                              <Route path="/expenses" element={<Guard><ExpenseDetailsPage /></Guard>} />
                              <Route path="/expenses/types" element={<Guard><ExpenseTypesPage /></Guard>} />
                              <Route path="/expenses/payment-types" element={<Guard><PaymentTypesPage /></Guard>} />
                              <Route path="/settings/vendors" element={<Guard><VendorsPage /></Guard>} />
                              <Route path="/settings/inventory" element={<Navigate to="/settings?tab=inventory" replace />} />
                              <Route path="/settings/inventory/receiving" element={<Guard><StockReceivingPage /></Guard>} />
                              <Route path="/settings/inventory/transfer" element={<Guard><StockTransferPage /></Guard>} />
                              <Route path="/settings/inventory/locations" element={<Guard><StorageLocationsMasterPage /></Guard>} />
                              <Route path="/settings/inventory/yield" element={<Guard><YieldConversionsMasterPage /></Guard>} />
                              <Route path="/back-office" element={<Guard><BackOfficePage /></Guard>} />
                              <Route path="*" element={<Navigate to="/" replace />} />
                            </Route>
                          </Route>
                        </Routes>
                      </ShiftProvider>
                    </PurchasingProvider>
                    <FlashPopup />
                  </PosProvider>
                  </CatalogProvider>
                  </FoodVoucherProvider>
                </CrmProvider>
              </MastersProvider>
            </SyncProvider>
          </BranchProvider>
        </AuthProvider>
      </I18nProvider>
    </Router>
  )
}
