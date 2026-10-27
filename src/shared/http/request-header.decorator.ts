import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Like @Headers(), but accepts pipes so headers can be parsed into value objects. */
export const RequestHeader = createParamDecorator(
  (name: string, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<Request>().header(name),
);
