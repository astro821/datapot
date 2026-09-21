import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    return req.user?.role === 'admin';
  }
}

@Injectable()
export class InitializedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // Soft check — controllers also verify DB; used for docs clarity
    return true;
  }
}
