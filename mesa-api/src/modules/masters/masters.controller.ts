import { Body, Controller, Delete, Get, Inject, Param, Put, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard, requireCompany, type JwtUser } from '../auth/jwt.guard'
import { MastersService } from './masters.service'

@Controller('masters')
@UseGuards(JwtAuthGuard)
export class MastersController {
  constructor(@Inject(MastersService) private readonly masters: MastersService) {}

  @Get('company')
  company(@Req() req: { user?: JwtUser }) {
    return this.masters.getCompany(requireCompany(req.user))
  }

  @Put('company')
  putCompany(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertCompany(body, requireCompany(req.user))
  }

  @Get('branches')
  branches(@Req() req: { user?: JwtUser }) {
    return this.masters.listBranches(requireCompany(req.user))
  }

  @Put('branches')
  putBranch(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertBranch(body, requireCompany(req.user))
  }

  @Delete('branches/:id')
  deleteBranch(@Req() req: { user?: JwtUser }, @Param('id') id: string) {
    return this.masters.deleteBranch(id, requireCompany(req.user))
  }

  @Get('categories')
  categories(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.masters.listCategories(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('categories')
  putCategory(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertCategory(
      { ...body, branchId: body.branchId ?? req.user?.branchId },
      requireCompany(req.user),
    )
  }

  @Delete('categories/:id')
  deleteCategory(@Req() req: { user?: JwtUser }, @Param('id') id: string) {
    return this.masters.deleteCategory(id, requireCompany(req.user))
  }

  @Get('products')
  products(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.masters.listProducts(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('products')
  putProduct(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertProduct(
      { ...body, branchId: body.branchId ?? req.user?.branchId },
      requireCompany(req.user),
    )
  }

  @Delete('products/:id')
  deleteProduct(@Req() req: { user?: JwtUser }, @Param('id') id: string) {
    return this.masters.deleteProduct(id, requireCompany(req.user))
  }

  @Get('catalog')
  catalog(@Req() req: { user?: JwtUser }) {
    return this.masters.listCatalog(requireCompany(req.user))
  }

  @Put('catalog/:kind')
  putCatalog(
    @Req() req: { user?: JwtUser },
    @Param('kind') kind: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.masters.upsertCatalogRow(kind, body, requireCompany(req.user))
  }

  @Delete('catalog/:kind/:id')
  deleteCatalog(
    @Req() req: { user?: JwtUser },
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.masters.deleteCatalogRow(kind, id, requireCompany(req.user))
  }

  @Put('gift-cards/redeem')
  redeemGiftCard(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.redeemGiftCard(
      String(body.id ?? ''),
      requireCompany(req.user),
      Number(body.amount ?? 0),
    )
  }

  @Get('customers')
  customers(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.masters.listCustomers(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('customers')
  putCustomer(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertCustomer(
      { ...body, branchId: body.branchId ?? req.user?.branchId },
      requireCompany(req.user),
    )
  }

  @Get('food-vouchers')
  foodVouchers(@Req() req: { user?: JwtUser }) {
    return this.masters.listFoodVouchers(requireCompany(req.user))
  }

  @Put('food-vouchers')
  putFoodVoucher(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertFoodVoucherBatch(body, requireCompany(req.user))
  }

  @Put('food-vouchers/redeem')
  redeemFoodVoucher(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.redeemFoodVoucherCode(String(body.id ?? ''), requireCompany(req.user))
  }

  @Delete('food-vouchers/:id')
  deleteFoodVoucher(@Req() req: { user?: JwtUser }, @Param('id') id: string) {
    return this.masters.deleteFoodVoucherBatch(id, requireCompany(req.user))
  }

  @Get('vendors')
  vendors(@Req() req: { user?: JwtUser }) {
    return this.masters.listVendors(requireCompany(req.user))
  }

  @Put('vendors')
  putVendor(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertVendor(body, requireCompany(req.user))
  }

  @Put('vendors/ledger')
  putVendorLedger(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertVendorLedger(body, requireCompany(req.user))
  }

  @Delete('vendors/:id')
  deleteVendor(@Req() req: { user?: JwtUser }, @Param('id') id: string) {
    return this.masters.deleteVendor(id, requireCompany(req.user))
  }

  @Get('floor')
  floor(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.masters.listFloorTables(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('floor')
  putFloor(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertFloorTable(body, requireCompany(req.user))
  }

  @Delete('floor/:id')
  deleteFloor(@Req() req: { user?: JwtUser }, @Param('id') id: string) {
    return this.masters.deleteFloorTable(id, requireCompany(req.user))
  }

  @Get('stock')
  stock(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.masters.listStockItems(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('stock')
  putStock(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertStockItem(body, requireCompany(req.user))
  }

  @Get('ingredients')
  ingredients(@Req() req: { user?: JwtUser }) {
    return this.masters.listIngredients(requireCompany(req.user))
  }

  @Put('ingredients')
  putIngredient(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertIngredient(body, requireCompany(req.user))
  }

  @Delete('ingredients/:id')
  deleteIngredient(@Req() req: { user?: JwtUser }, @Param('id') id: string) {
    return this.masters.deleteIngredient(requireCompany(req.user), id)
  }

  @Get('receipts')
  receipts(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.masters.listStockReceipts(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('receipts')
  putReceipt(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertStockReceipt(
      { ...body, branchId: body.branchId ?? req.user?.branchId },
      requireCompany(req.user),
    )
  }

  @Get('purchase-orders')
  purchaseOrders(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.masters.listPurchaseOrders(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('purchase-orders')
  putPurchaseOrder(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertPurchaseOrder(
      { ...body, branchId: body.branchId ?? req.user?.branchId },
      requireCompany(req.user),
    )
  }

  @Get('stock-transfers')
  stockTransfers(@Req() req: { user?: JwtUser }, @Query('branchId') branchId?: string) {
    return this.masters.listStockTransfers(requireCompany(req.user), branchId ?? req.user?.branchId)
  }

  @Put('stock-transfers')
  putStockTransfer(@Req() req: { user?: JwtUser }, @Body() body: Record<string, unknown>) {
    return this.masters.upsertStockTransfer(
      { ...body, branchId: body.branchId ?? req.user?.branchId },
      requireCompany(req.user),
    )
  }
}
