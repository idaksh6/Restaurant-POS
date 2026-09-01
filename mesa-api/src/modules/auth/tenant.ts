import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'

export async function companyIdForBranch(prisma: PrismaService, branchId: string) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { companyId: true },
  })
  if (!branch) throw new BadRequestException('Branch not found')
  return branch.companyId
}

export async function assertBranchInCompany(
  prisma: PrismaService,
  branchId: string,
  companyId: string,
) {
  const id = await companyIdForBranch(prisma, branchId)
  if (id !== companyId) throw new ForbiddenException('Branch does not belong to this company')
  return id
}
