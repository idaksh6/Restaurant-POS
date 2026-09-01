import type { NestMiddleware } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import jwt from 'jsonwebtoken'
import { tenantAls } from './tenant-context'

const SECRET = () => process.env.JWT_SECRET ?? 'mesa-dev-secret'

/**
 * Soft-parse Bearer JWT so Prisma routes to the right company DB
 * before controllers/guards run.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: { headers: { authorization?: string } }, _res: unknown, next: () => void) {
    let companyId: string | undefined
    const header = req.headers.authorization ?? ''
    if (header.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(header.slice(7), SECRET()) as { companyId?: string; typ?: string }
        if (payload.typ !== 'dev-portal' && payload.companyId) {
          companyId = String(payload.companyId)
        }
      } catch {
        /* guard will reject invalid tokens */
      }
    }
    tenantAls.run({ companyId }, () => next())
  }
}
