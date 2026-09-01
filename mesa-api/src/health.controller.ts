import { Controller, Get, HttpStatus, Res } from '@nestjs/common'
import type { Response } from 'express'
import { InjectPrisma, PrismaService } from './prisma.service'

@Controller()
export class HealthController {
  constructor(@InjectPrisma() private readonly prisma: PrismaService) {}

  @Get('health')
  async health(@Res({ passthrough: true }) res: Response) {
    let db: 'up' | 'down' = 'down'
    try {
      await this.prisma.$queryRaw`SELECT 1`
      db = 'up'
    } catch {
      db = 'down'
    }
    const ok = db === 'up'
    if (!ok) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE)
    }
    return {
      ok,
      service: 'mesa-api',
      db,
      at: new Date().toISOString(),
    }
  }
}
