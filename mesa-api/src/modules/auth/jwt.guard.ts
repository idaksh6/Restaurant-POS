import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { AuthService } from './auth.service'

export type JwtUser = {
  sub: string
  role: string
  name: string
  branchId?: string
  companyId?: string
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: JwtUser }>()
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new UnauthorizedException('Sign in required')
    req.user = this.auth.verify(token)
    return true
  }
}

export function requireCompany(user?: JwtUser) {
  if (!user?.companyId) throw new BadRequestException('Company is not bound on this session')
  return user.companyId
}

export function requireAdmin(user?: JwtUser) {
  if (user?.role !== 'admin') throw new ForbiddenException('Only Admin can manage users and roles')
  return requireCompany(user)
}
