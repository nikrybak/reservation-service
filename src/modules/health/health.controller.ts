import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'kysely';
import { Public } from '../../shared/auth/auth.decorators';
import {
  PERSISTENCE_HANDLE,
  type PersistenceHandle,
} from '../../shared/persistence/persistence-handle';

export interface HealthResponse {
  readonly status: 'ok';
  readonly persistence: PersistenceHandle['driver'];
}

@Controller('health')
export class HealthController {
  constructor(@Inject(PERSISTENCE_HANDLE) private readonly persistence: PersistenceHandle) {}

  @Get()
  @Public()
  async check(): Promise<HealthResponse> {
    if (this.persistence.driver === 'postgres') {
      try {
        await sql`SELECT 1`.execute(this.persistence.database.root);
      } catch {
        throw new ServiceUnavailableException('Database is unreachable');
      }
    }
    return { status: 'ok', persistence: this.persistence.driver };
  }
}
