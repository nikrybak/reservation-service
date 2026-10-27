import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../config/app-config';
import { type AuthenticatedRequest, ROLES_KEY } from './auth.decorators';

/** Runs after ApiKeyGuard; routes without @Roles accept any authenticated principal. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal || !required.includes(principal.role)) {
      throw new ForbiddenException(`Requires one of the roles: ${required.join(', ')}`);
    }
    return true;
  }
}
