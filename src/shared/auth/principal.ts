import type { Role } from '../config/app-config';

export interface Principal {
  readonly id: string;
  readonly role: Role;
}

/** Owners and admins may act on a resource. */
export function canActOn(principal: Principal, ownerId: string): boolean {
  return principal.role === 'admin' || principal.id === ownerId;
}
