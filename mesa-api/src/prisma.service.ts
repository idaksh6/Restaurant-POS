import { Inject } from '@nestjs/common'
import type { PrismaClient } from '@prisma/client'

/** Runtime token + compile-time PrismaClient shape (declaration merge). */
export interface PrismaService extends PrismaClient {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PrismaService {}

export const InjectPrisma = () => Inject(PrismaService)
