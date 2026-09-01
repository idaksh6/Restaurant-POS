import { AsyncLocalStorage } from 'async_hooks'

export type TenantStore = { companyId?: string }

export const tenantAls = new AsyncLocalStorage<TenantStore>()

export function getRequestCompanyId() {
  return tenantAls.getStore()?.companyId
}

export function runWithCompanyId<T>(companyId: string | undefined, fn: () => T): T {
  return tenantAls.run({ companyId }, fn)
}
