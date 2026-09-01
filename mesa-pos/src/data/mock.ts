export type TableStatus = 'free' | 'occupied' | 'billing' | 'reserved'
export type OrderType = 'dine-in' | 'takeaway' | 'delivery' | 'online'
export type KitchenPriority = 'high' | 'normal' | 'low'
export type KitchenTicketStatus = 'queued' | 'cooking' | 'ready'

export type Table = {
  id: string
  label: string
  seats: number
  area: string
  status: TableStatus
  note?: string
  guests?: number
  openedAt?: string
  amount?: number
}

export type MenuItem = {
  id: string
  name: string
  category: string
  price: number
  code: string
  popular?: boolean
  active?: boolean
}

export type OrderLine = {
  id: string
  itemId: string
  name: string
  qty: number
  price: number
  note?: string
  sent?: boolean
}

export type StockItem = {
  id: string
  name: string
  sku: string
  category: string
  unit: string
  onHand: number
  reorderAt: number
  cost: number
  /** Links warehouse SKU to the recipe ingredient catalog. */
  ingredientId?: string
  /** Preferred supplier id when linked to Vendors. */
  vendorId?: string
  /** Denormalized vendor name for display / offline. */
  vendor?: string
  branchId?: string
  /** On-hand qty per storage area. Sum equals onHand. */
  locationBalances?: Partial<Record<'cold_store' | 'dry_store' | 'bar' | 'kitchen' | 'pastry' | 'store', number>>
}

export type StaffMember = {
  id: string
  name: string
  nameAr?: string
  role: string
  shift: string
  sales: number
}

export type DeliveryBoy = {
  id: string
  name: string
  phone: string
  status: 'available' | 'on-route'
}

export type OpenTicket = {
  id: string
  type: OrderType
  customer: string
  phone?: string
  address?: string
  deliveryBoyId?: string
  deliveryFee?: number
  /** Own-fleet delivery board stage (Petpooja-style). */
  deliveryStatus?: 'new' | 'preparing' | 'ready' | 'dispatched' | 'delivered'
  dispatchedAt?: string
  deliveredAt?: string
  /** Own-fleet customer OTP shown to rider at door / verify before settle. */
  deliveryOtp?: string
  /** Aggregator / channel order reference (HungerStation, Jahez, …). */
  externalOrderId?: string
  /** pending until staff accepts webhook order */
  channelAcceptStatus?: 'pending' | 'accepted' | 'rejected'
  openedAt: string
  lines: OrderLine[]
  channel?: string
  /** Operating branch — tickets are scoped per branch. */
  branchId?: string
  tableId?: string
  guests?: number
  checkStatus?: 'open' | 'billing' | 'settled'
  kitchenStatus?: KitchenTicketStatus
  kitchenPriority?: KitchenPriority
  /** Kitchen pressed Done — keep off KOT board until a new KOT is sent */
  kitchenDismissed?: boolean
  /** Takeaway: customer parked while serving the next guest */
  held?: boolean
  heldAt?: string
  discountPct?: number
  chargeIds?: string[]
  amount?: number
  /** Client/server millis — used to keep the newest ticket when two POS terminals edit the same check. */
  updatedAt?: number
}

export type KitchenTicket = {
  id: string
  source: string
  priority: KitchenPriority
  status: KitchenTicketStatus
  createdAt: string
  lines: Array<{ name: string; qty: number; itemId?: string }>
  branchId?: string
}

export const tableAreas = ['Main Hall', 'Family Section', 'Outdoor', 'Private'] as const

export const tables: Table[] = [
  { id: 't1', label: '01', seats: 2, area: 'Main Hall', status: 'free' },
  { id: 't2', label: '02', seats: 2, area: 'Main Hall', status: 'occupied', guests: 2, openedAt: '12:18', amount: 92 },
  { id: 't3', label: '03', seats: 4, area: 'Main Hall', status: 'billing', guests: 3, openedAt: '11:52', amount: 255 },
  { id: 't4', label: '04', seats: 4, area: 'Main Hall', status: 'occupied', guests: 4, openedAt: '12:05', amount: 154 },
  { id: 't5', label: '05', seats: 6, area: 'Family Section', status: 'reserved', guests: 6 },
  { id: 't6', label: '06', seats: 2, area: 'Family Section', status: 'free' },
  { id: 't7', label: '07', seats: 4, area: 'Outdoor', status: 'free' },
  { id: 't8', label: '08', seats: 8, area: 'Outdoor', status: 'occupied', guests: 7, openedAt: '11:40', amount: 423 },
  { id: 't9', label: '09', seats: 2, area: 'Private', status: 'free' },
  { id: 't10', label: '10', seats: 4, area: 'Private', status: 'occupied', guests: 2, openedAt: '12:22', amount: 68 },
  { id: 't11', label: '11', seats: 4, area: 'Private', status: 'free' },
  { id: 't12', label: '12', seats: 6, area: 'Family Section', status: 'billing', guests: 5, openedAt: '11:10', amount: 358 },
]

export const menu: MenuItem[] = [
  { id: 'm1', code: '101', name: 'Tomato Bisque', category: 'Starters', price: 28.12, popular: true },
  { id: 'm2', code: '102', name: 'Burrata & Peach', category: 'Starters', price: 41.25 },
  { id: 'm3', code: '103', name: 'Crispy Calamari', category: 'Starters', price: 35.62, popular: true },
  { id: 'm14', code: '104', name: 'Garden Salad', category: 'Starters', price: 30.0 },
  { id: 'm15', code: '105', name: 'Garlic Bread', category: 'Starters', price: 20.62, popular: true },
  { id: 'm16', code: '106', name: 'Soup of the Day', category: 'Starters', price: 24.38 },
  { id: 'm17', code: '107', name: 'Beef Carpaccio', category: 'Starters', price: 48.75 },
  { id: 'm4', code: '201', name: 'Herb Roast Chicken', category: 'Mains', price: 69.38, popular: true },
  { id: 'm5', code: '202', name: 'Mushroom Risotto', category: 'Mains', price: 60.0 },
  { id: 'm6', code: '203', name: 'Catch of the Day', category: 'Mains', price: 82.5 },
  { id: 'm18', code: '204', name: 'Pasta Alfredo', category: 'Mains', price: 58.12, popular: true },
  { id: 'm19', code: '205', name: 'Veggie Bowl', category: 'Mains', price: 52.5 },
  { id: 'm20', code: '206', name: 'Grilled Salmon', category: 'Mains', price: 90.0, popular: true },
  { id: 'm21', code: '207', name: 'Chicken Parmigiana', category: 'Mains', price: 71.25 },
  { id: 'm22', code: '208', name: 'Seafood Linguine', category: 'Mains', price: 88.12 },
  { id: 'm7', code: '301', name: 'Ribeye 300g', category: 'Grill', price: 127.5, popular: true },
  { id: 'm8', code: '302', name: 'Lamb Chops', category: 'Grill', price: 106.88 },
  { id: 'm23', code: '303', name: 'Sirloin 250g', category: 'Grill', price: 108.75 },
  { id: 'm24', code: '304', name: 'Mixed Grill Platter', category: 'Grill', price: 142.5, popular: true },
  { id: 'm25', code: '305', name: 'BBQ Chicken Skewer', category: 'Grill', price: 61.88 },
  { id: 'm9', code: '401', name: 'House Lemonade', category: 'Drinks', price: 16.88, popular: true },
  { id: 'm10', code: '402', name: 'Espresso', category: 'Drinks', price: 11.25 },
  { id: 'm11', code: '403', name: 'Sparkling Water', category: 'Drinks', price: 13.12 },
  { id: 'm26', code: '404', name: 'Fresh Orange Juice', category: 'Drinks', price: 18.75 },
  { id: 'm27', code: '405', name: 'Iced Tea', category: 'Drinks', price: 13.12 },
  { id: 'm28', code: '406', name: 'Cappuccino', category: 'Drinks', price: 15.0, popular: true },
  { id: 'm29', code: '407', name: 'Soft Drink', category: 'Drinks', price: 9.38 },
  { id: 'm30', code: '408', name: 'Still Water', category: 'Drinks', price: 7.5 },
  { id: 'm12', code: '501', name: 'Chocolate Fondant', category: 'Dessert', price: 31.88, popular: true },
  { id: 'm13', code: '502', name: 'Citrus Panna Cotta', category: 'Dessert', price: 28.12 },
  { id: 'm31', code: '503', name: 'Tiramisu', category: 'Dessert', price: 30.0, popular: true },
  { id: 'm32', code: '504', name: 'Ice Cream Trio', category: 'Dessert', price: 24.38 },
  { id: 'm33', code: '505', name: 'Cheesecake', category: 'Dessert', price: 26.25 },
  { id: 'm34', code: '601', name: 'Fries', category: 'Sides', price: 15.0, popular: true },
  { id: 'm35', code: '602', name: 'Mashed Potato', category: 'Sides', price: 16.88 },
  { id: 'm36', code: '603', name: 'Seasonal Veg', category: 'Sides', price: 16.88 },
  { id: 'm37', code: '604', name: 'Side Salad', category: 'Sides', price: 15.0 },
  { id: 'm38', code: '701', name: 'Kids Pasta', category: 'Kids', price: 31.88 },
  { id: 'm39', code: '702', name: 'Kids Nuggets', category: 'Kids', price: 30.0, popular: true },
  { id: 'm40', code: '703', name: 'Kids Mini Burger', category: 'Kids', price: 33.75 },
]

export const seedOrders: Record<string, OrderLine[]> = {
  t2: [
    { id: 'o1', itemId: 'm1', name: 'Tomato Bisque', qty: 1, price: 28.12, sent: true },
    { id: 'o2', itemId: 'm4', name: 'Herb Roast Chicken', qty: 1, price: 69.38, sent: true },
  ],
  t3: [
    { id: 'o3', itemId: 'm3', name: 'Crispy Calamari', qty: 2, price: 35.62, sent: true },
    { id: 'o4', itemId: 'm7', name: 'Ribeye 300g', qty: 1, price: 127.5, sent: true },
    { id: 'o5', itemId: 'm9', name: 'House Lemonade', qty: 3, price: 16.88, sent: true },
  ],
  t4: [
    { id: 'o6', itemId: 'm2', name: 'Burrata & Peach', qty: 1, price: 41.25, sent: true },
    { id: 'o7', itemId: 'm5', name: 'Mushroom Risotto', qty: 2, price: 60.0, sent: true },
  ],
  t8: [
    { id: 'o8', itemId: 'm7', name: 'Ribeye 300g', qty: 2, price: 127.5, sent: true },
    { id: 'o9', itemId: 'm6', name: 'Catch of the Day', qty: 2, price: 82.5, sent: true },
    { id: 'o10', itemId: 'm11', name: 'Sparkling Water', qty: 4, price: 13.12, sent: true },
  ],
  t10: [
    { id: 'o11', itemId: 'm10', name: 'Espresso', qty: 2, price: 11.25, sent: true },
    { id: 'o12', itemId: 'm12', name: 'Chocolate Fondant', qty: 1, price: 31.88, sent: false },
  ],
  t12: [
    { id: 'o13', itemId: 'm4', name: 'Herb Roast Chicken', qty: 3, price: 69.38, sent: true },
    { id: 'o14', itemId: 'm8', name: 'Lamb Chops', qty: 1, price: 106.88, sent: true },
    { id: 'o15', itemId: 'm13', name: 'Citrus Panna Cotta', qty: 2, price: 28.12, sent: true },
  ],
}

export const stock: StockItem[] = [
  { id: 's1', name: 'Ribeye Steak', sku: 'MEAT-RIB-300', category: 'Meat', unit: 'kg', onHand: 8.4, reorderAt: 10, cost: 18.2, vendorId: 'vnd-meat', vendor: 'Al Nakheel Meats' },
  { id: 's2', name: 'Chicken Breast', sku: 'MEAT-CHK-BR', category: 'Meat', unit: 'kg', onHand: 22.0, reorderAt: 12, cost: 6.4, vendorId: 'vnd-meat', vendor: 'Al Nakheel Meats' },
  { id: 's3', name: 'Arborio Rice', sku: 'DRY-ARB-1', category: 'Dry Goods', unit: 'kg', onHand: 4.2, reorderAt: 6, cost: 3.1, vendorId: 'vnd-dry', vendor: 'Riyadh Dry Store' },
  { id: 's4', name: 'Tomatoes', sku: 'PRD-TOM', category: 'Produce', unit: 'kg', onHand: 14.5, reorderAt: 8, cost: 2.4, vendorId: 'vnd-produce', vendor: 'Farm Fresh KSA' },
  { id: 's5', name: 'Burrata', sku: 'DRY-BUR', category: 'Dairy', unit: 'pcs', onHand: 6, reorderAt: 12, cost: 2.8, vendorId: 'vnd-dairy', vendor: 'Najd Dairy Co' },
  { id: 's6', name: 'Lemonade Base', sku: 'BEV-LEM', category: 'Beverage', unit: 'L', onHand: 18, reorderAt: 10, cost: 1.9, vendorId: 'vnd-bev', vendor: 'Gulf Beverages' },
  { id: 's7', name: 'Espresso Beans', sku: 'BEV-ESP', category: 'Beverage', unit: 'kg', onHand: 2.1, reorderAt: 3, cost: 14.0, vendorId: 'vnd-bev', vendor: 'Gulf Beverages' },
  { id: 's8', name: 'Chocolate', sku: 'DRY-CHO', category: 'Dry Goods', unit: 'kg', onHand: 1.4, reorderAt: 2, cost: 9.5, vendorId: 'vnd-dry', vendor: 'Riyadh Dry Store' },
  { id: 's9', name: 'Olive Oil', sku: 'DRY-OIL', category: 'Dry Goods', unit: 'L', onHand: 9.0, reorderAt: 4, cost: 7.2, vendorId: 'vnd-dry', vendor: 'Riyadh Dry Store' },
  { id: 's10', name: 'Sea Bass', sku: 'SEA-BAS', category: 'Seafood', unit: 'kg', onHand: 3.6, reorderAt: 5, cost: 16.8, vendorId: 'vnd-seafood', vendor: 'Red Sea Catch' },
  {
    id: 's11',
    name: 'Fresh Milk',
    sku: 'DAIR-MILK',
    category: 'Dairy',
    unit: 'L',
    onHand: 50,
    reorderAt: 20,
    cost: 1.2,
    vendorId: 'vnd-dairy',
    vendor: 'Najd Dairy Co',
    locationBalances: { cold_store: 38, bar: 12, dry_store: 0, kitchen: 0, pastry: 0 },
  },
  {
    id: 's12',
    name: 'All-Purpose Flour',
    sku: 'DRY-FLR',
    category: 'Dry Goods',
    unit: 'kg',
    onHand: 40,
    reorderAt: 15,
    cost: 0.8,
    vendorId: 'vnd-dry',
    vendor: 'Riyadh Dry Store',
    locationBalances: { dry_store: 30, pastry: 10, cold_store: 0, bar: 0, kitchen: 0 },
  },
  {
    id: 's13',
    name: 'Raw Whole Potatoes',
    sku: 'PRD-POT-RAW',
    category: 'Produce',
    unit: 'kg',
    onHand: 25,
    reorderAt: 10,
    cost: 1.1,
    vendorId: 'vnd-produce',
    vendor: 'Farm Fresh KSA',
    locationBalances: { dry_store: 25, cold_store: 0, bar: 0, kitchen: 0, pastry: 0 },
  },
  {
    id: 's14',
    name: 'French Fry Cut Potatoes',
    sku: 'PRD-POT-FRY',
    category: 'Produce',
    unit: 'kg',
    onHand: 0,
    reorderAt: 5,
    cost: 1.4,
    vendorId: 'vnd-produce',
    vendor: 'Farm Fresh KSA',
    locationBalances: { kitchen: 0, dry_store: 0, cold_store: 0, bar: 0, pastry: 0 },
  },
  {
    id: 's15',
    name: 'Whole Paneer Block',
    sku: 'DRY-PAN-BLK',
    category: 'Dairy',
    unit: 'kg',
    onHand: 10,
    reorderAt: 4,
    cost: 5.5,
    vendorId: 'vnd-dairy',
    vendor: 'Najd Dairy Co',
    locationBalances: { cold_store: 10, dry_store: 0, bar: 0, kitchen: 0, pastry: 0 },
  },
  {
    id: 's16',
    name: 'Paneer Cubes / Tikka Portion',
    sku: 'DRY-PAN-CKB',
    category: 'Dairy',
    unit: 'kg',
    onHand: 0,
    reorderAt: 3,
    cost: 5.8,
    vendorId: 'vnd-dairy',
    vendor: 'Najd Dairy Co',
    locationBalances: { kitchen: 0, cold_store: 0, dry_store: 0, bar: 0, pastry: 0 },
  },
]

export const staff: StaffMember[] = [
  { id: 'st1', name: 'Amina Khan', nameAr: 'أمينة خان', role: 'Admin', shift: '10:00–18:00', sales: 4650 },
  { id: 'st2', name: 'Leo Martins', nameAr: 'ليو مارتينز', role: 'Waiter', shift: '11:00–19:00', sales: 3225 },
  { id: 'st3', name: 'Sara Nguyen', nameAr: 'سارة نجوين', role: 'Waiter', shift: '12:00–20:00', sales: 2700 },
  { id: 'st4', name: 'Omar Faris', nameAr: 'عمر فارس', role: 'Cashier', shift: '10:00–18:00', sales: 5775 },
]

export const deliveryBoys: DeliveryBoy[] = [
  { id: 'd1', name: 'Arun', phone: '+966 50 111 2233', status: 'available' },
  { id: 'd2', name: 'John', phone: '+966 55 222 3344', status: 'on-route' },
  { id: 'd3', name: 'Basil', phone: '+966 54 333 4455', status: 'available' },
]

export const seedTickets: OpenTicket[] = [
  {
    id: 'tk1',
    type: 'takeaway',
    customer: 'Walk-in #14',
    openedAt: '12:28',
    lines: [
      { id: 'tl1', itemId: 'm4', name: 'Herb Roast Chicken', qty: 1, price: 69.38, sent: true },
      { id: 'tl2', itemId: 'm9', name: 'House Lemonade', qty: 2, price: 16.88, sent: true },
    ],
  },
  {
    id: 'dl-13-seed',
    type: 'delivery',
    customer: 'Nora Ali',
    phone: '+966 50 123 4567',
    address: 'Olaya St, Riyadh',
    deliveryBoyId: 'd2',
    deliveryFee: 15.0,
    deliveryStatus: 'dispatched',
    dispatchedAt: '12:25',
    openedAt: '12:10',
    lines: [
      { id: 'tl3', itemId: 'm7', name: 'Ribeye 300g', qty: 1, price: 127.5, sent: true },
      { id: 'tl4', itemId: 'm12', name: 'Chocolate Fondant', qty: 1, price: 31.88, sent: true },
    ],
  },
  {
    id: 'tk3',
    type: 'online',
    customer: 'James Cole',
    phone: '+966 55 987 6543',
    address: 'King Fahd Rd, Riyadh',
    channel: 'HungerStation',
    deliveryFee: 13.12,
    openedAt: '12:31',
    lines: [
      { id: 'tl5', itemId: 'm5', name: 'Mushroom Risotto', qty: 2, price: 60.0, sent: false },
      { id: 'tl6', itemId: 'm11', name: 'Sparkling Water', qty: 2, price: 13.12, sent: false },
    ],
  },
]

export const seedKitchen: KitchenTicket[] = [
  {
    id: 'k1',
    source: 'Table 03',
    priority: 'high',
    status: 'cooking',
    createdAt: '12:20',
    lines: [
      { name: 'Crispy Calamari', qty: 2 },
      { name: 'Ribeye 300g', qty: 1 },
    ],
  },
  {
    id: 'k2',
    source: 'Table 08',
    priority: 'normal',
    status: 'queued',
    createdAt: '12:26',
    lines: [
      { name: 'Catch of the Day', qty: 2 },
      { name: 'Ribeye 300g', qty: 2 },
    ],
  },
  {
    id: 'k3',
    source: 'Takeaway #14',
    priority: 'normal',
    status: 'ready',
    createdAt: '12:15',
    lines: [{ name: 'Herb Roast Chicken', qty: 1 }],
  },
]

export const salesByHour = [
  { hour: '10', amount: 450 },
  { hour: '11', amount: 1050 },
  { hour: '12', amount: 2400 },
  { hour: '13', amount: 3075 },
  { hour: '14', amount: 1912 },
  { hour: '15', amount: 1087 },
  { hour: '16', amount: 1275 },
  { hour: '17', amount: 1762 },
]

export { money, calcVat, withVat, SAUDI } from '../locale/saudi'

export function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function lineTotal(lines: OrderLine[]) {
  return lines.reduce((sum, line) => sum + line.qty * line.price, 0)
}
