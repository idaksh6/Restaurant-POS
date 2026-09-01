import type { RoleKey } from '../auth/roles'

export type StaffAccount = {
  id: string
  name: string
  role: RoleKey
  roleLabel: string
  pin: string
  initials: string
  /** Set when signed in as a delivery rider (not a staff user). */
  riderId?: string
}

export const staffAccounts: StaffAccount[] = [
  {
    id: 'st1',
    name: 'Amina Khan',
    role: 'admin',
    roleLabel: 'Admin',
    pin: '1111',
    initials: 'AK',
  },
  {
    id: 'st4',
    name: 'Omar Faris',
    role: 'cashier',
    roleLabel: 'Cashier',
    pin: '1234',
    initials: 'OF',
  },
  {
    id: 'st2',
    name: 'Leo Martins',
    role: 'food-server',
    roleLabel: 'Food Server',
    pin: '2222',
    initials: 'LM',
  },
  {
    id: 'st3',
    name: 'Sara Nguyen',
    role: 'kitchen-manager',
    roleLabel: 'Kitchen Manager',
    pin: '3333',
    initials: 'SN',
  },
  {
    id: 'st5',
    name: 'Hassan Ali',
    role: 'custom',
    roleLabel: 'Custom',
    pin: '4444',
    initials: 'HA',
  },
]
