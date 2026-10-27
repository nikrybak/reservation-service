import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../config/app-config';
import type { Principal } from './principal';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

export type AuthenticatedRequest = Request & { principal?: Principal };

/** Skips API-key authentication, e.g. for health probes. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
  if (!principal) {
    throw new Error('CurrentPrincipal used on a route without authentication');
  }
  return principal;
});
