import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { getRequestCompanyId } from './tenant-context'

function sanitizeDbName(raw: string) {
  const clean = String(raw || 'tenant')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return `mesa_t_${clean || 'tenant'}`
}

function withDatabaseName(baseUrl: string, databaseName: string) {
  const url = new URL(baseUrl)
  url.pathname = `/${databaseName}`
  return url.toString()
}

function databaseNameFromUrl(urlStr: string) {
  try {
    const name = new URL(urlStr).pathname.replace(/^\//, '')
    return name || 'mesa'
  } catch {
    return 'mesa'
  }
}

function apiRootDir() {
  // dist/tenant → ../.. ; src/tenant → ../..
  const candidates = [
    path.resolve(__dirname, '../..'),
    path.resolve(process.cwd()),
  ]
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'prisma', 'schema.prisma'))) return dir
  }
  return process.cwd()
}

@Injectable()
export class TenantDbService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TenantDbService.name)
  /** Primary / control-plane client (DATABASE_URL). Also the DB for legacy co-mesa. */
  readonly control: PrismaClient
  private readonly clients = new Map<string, PrismaClient>()
  private readonly urlByCompany = new Map<string, string>()

  constructor() {
    this.control = new PrismaClient()
  }

  async onModuleInit() {
    await this.control.$connect()
    await this.syncLegacyRegistries()
    await this.refreshRegistryCache()
  }

  async onModuleDestroy() {
    await this.control.$disconnect()
    await Promise.all([...this.clients.values()].map((c) => c.$disconnect().catch(() => undefined)))
  }

  private adminUrl() {
    return (
      process.env.DATABASE_ADMIN_URL ||
      withDatabaseName(process.env.DATABASE_URL || 'postgresql://mesa:mesa@localhost:5432/mesa', 'postgres')
    )
  }

  private primaryUrl() {
    return process.env.DATABASE_URL || 'postgresql://mesa:mesa@localhost:5432/mesa'
  }

  /** Register every Company row already in the primary DB against DATABASE_URL. */
  private async syncLegacyRegistries() {
    const primary = this.primaryUrl()
    const dbName = databaseNameFromUrl(primary)
    try {
      const companies = await this.control.company.findMany({
        select: { id: true, taxId: true, companyName: true },
      })
      for (const c of companies) {
        const taxId = (c.taxId || c.id).trim()
        if (!taxId) continue
        const existing = await this.control.tenantRegistry.findUnique({ where: { id: c.id } })
        if (existing) {
          await this.control.tenantRegistry.update({
            where: { id: c.id },
            data: { companyName: c.companyName, taxId },
          })
          this.urlByCompany.set(c.id, existing.databaseUrl)
          continue
        }
        // Prefer an already-provisioned dedicated tenant DB when present.
        const tenantName = sanitizeDbName(c.id)
        const tenantUrl = withDatabaseName(primary, tenantName)
        let useTenant = false
        if (tenantName !== dbName) {
          try {
            const found = await this.control.$queryRawUnsafe<Array<{ datname: string }>>(
              `SELECT datname FROM pg_database WHERE datname = $1`,
              tenantName,
            )
            useTenant = found.length > 0
          } catch {
            useTenant = false
          }
        }
        await this.control.tenantRegistry.create({
          data: {
            id: c.id,
            taxId,
            companyName: c.companyName,
            databaseName: useTenant ? tenantName : dbName,
            databaseUrl: useTenant ? tenantUrl : primary,
          },
        })
        this.urlByCompany.set(c.id, useTenant ? tenantUrl : primary)
      }
    } catch (err) {
      this.log.warn(`Tenant registry sync skipped: ${err instanceof Error ? err.message : err}`)
    }
  }

  async refreshRegistryCache() {
    const rows = await this.control.tenantRegistry.findMany()
    this.urlByCompany.clear()
    for (const row of rows) this.urlByCompany.set(row.id, row.databaseUrl)
  }

  async getRegistryByTaxId(taxId: string) {
    return this.control.tenantRegistry.findFirst({ where: { taxId: taxId.trim() } })
  }

  async getRegistry(companyId: string) {
    return this.control.tenantRegistry.findUnique({ where: { id: companyId } })
  }

  async listRegistries() {
    return this.control.tenantRegistry.findMany({ orderBy: { companyName: 'asc' } })
  }

  private async resolveUrl(companyId: string) {
    const cached = this.urlByCompany.get(companyId)
    if (cached) return cached
    const row = await this.control.tenantRegistry.findUnique({ where: { id: companyId } })
    if (!row) return this.primaryUrl()
    this.urlByCompany.set(companyId, row.databaseUrl)
    return row.databaseUrl
  }

  /** Force re-read of TenantRegistry (e.g. after restore script while API is up). */
  async invalidateRegistryCache() {
    await this.refreshRegistryCache()
  }

  /** Nest-injectable PrismaClient proxy routed by AsyncLocalStorage companyId. */
  createRoutedProxy(): PrismaClient {
    const tenants = this
    return new Proxy({} as PrismaClient, {
      get(_target, prop) {
        if (prop === 'then') return undefined
        const client = tenants.getSyncClient()
        const value = Reflect.get(client as object, prop, client)
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value
      },
    })
  }

  /** Sync resolve for the Prisma proxy (clients are cached after first use). */
  getSyncClient(companyId = getRequestCompanyId()): PrismaClient {
    const id = companyId?.trim()
    if (!id) return this.control
    const url = this.urlByCompany.get(id) || this.primaryUrl()
    if (url === this.primaryUrl()) return this.control
    let client = this.clients.get(id)
    if (!client) {
      client = new PrismaClient({ datasources: { db: { url } } })
      this.clients.set(id, client)
      void client.$connect().catch((err) => {
        this.log.warn(`Tenant connect ${id}: ${err instanceof Error ? err.message : err}`)
      })
    }
    return client
  }

  async clientFor(companyId: string): Promise<PrismaClient> {
    await this.resolveUrl(companyId)
    const client = this.getSyncClient(companyId)
    if (client !== this.control) {
      try {
        await client.$connect()
      } catch {
        /* already connected / connecting */
      }
    }
    return client
  }

  /**
   * CREATE DATABASE + prisma migrate deploy + TenantRegistry row.
   * Returns a connected Prisma client for the new tenant database.
   */
  async provisionCompanyDb(input: {
    companyId: string
    companyName: string
    taxId: string
  }) {
    const companyId = input.companyId.trim()
    const taxId = input.taxId.trim()
    const dbName = sanitizeDbName(companyId)
    const databaseUrl = withDatabaseName(this.primaryUrl(), dbName)

    const taxTaken = await this.control.tenantRegistry.findFirst({ where: { taxId } })
    if (taxTaken) {
      // Retry after a failed register: registry exists but tenant DB is missing/empty.
      if (taxTaken.id === companyId || taxTaken.taxId === taxId) {
        const recoverable = await this.tryRecoverBrokenTenant(taxTaken.id, taxTaken.databaseName)
        if (!recoverable) {
          throw new Error(`Tenant registry already has taxId ${taxId}`)
        }
        await this.control.tenantRegistry.delete({ where: { id: taxTaken.id } }).catch(() => undefined)
        this.urlByCompany.delete(taxTaken.id)
        this.clients.delete(taxTaken.id)
      } else {
        throw new Error(`Tenant registry already has taxId ${taxId}`)
      }
    }
    const idTaken = await this.control.tenantRegistry.findUnique({ where: { id: companyId } })
    if (idTaken) {
      const recoverable = await this.tryRecoverBrokenTenant(idTaken.id, idTaken.databaseName)
      if (!recoverable) {
        throw new Error(`Tenant registry already has company ${companyId}`)
      }
      await this.control.tenantRegistry.delete({ where: { id: companyId } }).catch(() => undefined)
      this.urlByCompany.delete(companyId)
      this.clients.delete(companyId)
    }

    await this.createPostgresDatabase(dbName)
    await this.migrateDatabase(databaseUrl)

    await this.control.tenantRegistry.create({
      data: {
        id: companyId,
        taxId,
        companyName: input.companyName.trim(),
        databaseName: dbName,
        databaseUrl,
      },
    })
    this.urlByCompany.set(companyId, databaseUrl)

    this.log.log(`Provisioned tenant database ${dbName} for ${companyId}`)
    return this.clientFor(companyId)
  }

  /** true = safe to delete registry and re-provision (DB missing or has no Company row). */
  private async tryRecoverBrokenTenant(companyId: string, databaseName: string) {
    try {
      const url = withDatabaseName(this.primaryUrl(), databaseName)
      const client = new PrismaClient({ datasources: { db: { url } } })
      try {
        await client.$connect()
        const companies = await client.company.count().catch(() => -1)
        if (companies === 0 || companies === -1) return true
        return false
      } finally {
        await client.$disconnect().catch(() => undefined)
      }
    } catch {
      return true
    }
  }

  private async createPostgresDatabase(dbName: string) {
    if (!/^mesa_t_[a-z0-9_]+$/.test(dbName)) {
      throw new Error(`Refusing unsafe database name: ${dbName}`)
    }
    const admin = new PrismaClient({
      datasources: { db: { url: this.adminUrl() } },
    })
    try {
      await admin.$connect()
      const found = await admin.$queryRawUnsafe<Array<{ datname: string }>>(
        `SELECT datname FROM pg_database WHERE datname = $1`,
        dbName,
      )
      if (!found.length) {
        // CREATE DATABASE cannot run inside a transaction; Prisma $executeRaw is fine here.
        await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
        this.log.log(`Created Postgres database ${dbName}`)
      }
    } finally {
      await admin.$disconnect().catch(() => undefined)
    }
  }

  private migrateDatabase(databaseUrl: string) {
    const root = apiRootDir()
    const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js')
    if (!existsSync(prismaCli)) {
      throw new Error(`Prisma CLI not found at ${prismaCli}`)
    }
    this.log.log(`Running prisma migrate deploy for tenant DB…`)
    try {
      execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      const e = err as { stderr?: Buffer; stdout?: Buffer; message?: string }
      const detail = [e.stderr?.toString(), e.stdout?.toString(), e.message]
        .filter(Boolean)
        .join('\n')
        .trim()
      throw new Error(detail || 'prisma migrate deploy failed')
    }
  }
}
