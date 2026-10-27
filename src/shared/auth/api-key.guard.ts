import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type ApiKeyEntry, APP_CONFIG, type AppConfig } from '../config/app-config';
import { type AuthenticatedRequest, IS_PUBLIC_KEY } from './auth.decorators';

export const API_KEY_HEADER = 'x-api-key';

interface HashedKey {
  readonly digest: Buffer;
  readonly entry: ApiKeyEntry;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly keys: readonly HashedKey[];

  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.keys = config.apiKeys.map((entry) => ({ digest: digest(entry.key), entry }));
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const presented = request.header(API_KEY_HEADER);
    if (!presented) {
      throw new UnauthorizedException(`Missing ${API_KEY_HEADER} header`);
    }

    const match = this.find(presented);
    if (!match) {
      throw new UnauthorizedException('Invalid API key');
    }
    request.principal = { id: match.principalId, role: match.role };
    return true;
  }

  /**
   * Hashing first gives equal-length buffers for timingSafeEqual, and scanning every key
   * keeps the response time independent of which key, if any, matched.
   */
  private find(presented: string): ApiKeyEntry | undefined {
    const candidate = digest(presented);
    let found: ApiKeyEntry | undefined;
    for (const key of this.keys) {
      if (timingSafeEqual(key.digest, candidate)) {
        found = key.entry;
      }
    }
    return found;
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
