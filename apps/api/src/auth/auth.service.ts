import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  UserDto,
} from '@datapot/shared';
import { BootstrapService } from '../bootstrap/bootstrap.service';
import { DatabaseService } from '../database/database.service';
import { UserStore } from '../users/user.store';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserStore,
    private readonly jwt: JwtService,
    private readonly bootstrap: BootstrapService,
    private readonly db: DatabaseService,
  ) {}

  async ensureSeedAdmin(): Promise<void> {
    if (!this.db.isConnected) return;
    const count = await this.users.count();
    if (count === 0) {
      const password =
        this.bootstrap.config.adminPasswordOverride || DEFAULT_ADMIN_PASSWORD;
      const passwordHash = await bcrypt.hash(password, 10);
      await this.users.create({
        username: DEFAULT_ADMIN_USERNAME,
        passwordHash,
        role: 'admin',
      });
    }
  }

  async validateUser(username: string, password: string): Promise<UserDto> {
    if (!this.db.isConnected) {
      throw new UnauthorizedException('System is not initialized');
    }
    const user = await this.users.findByUsername(username);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.toDto(user);
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    return { accessToken, user };
  }

  /** DBMS 미연결 시 기본 관리자로 콘솔(시스템 관리) 진입 */
  async loginBootstrapAdmin() {
    if (this.db.isConnected && this.bootstrap.ready) {
      throw new UnauthorizedException(
        'System is already initialized — use normal login',
      );
    }
    const user: UserDto = {
      id: 'bootstrap-admin',
      username: DEFAULT_ADMIN_USERNAME,
      role: 'admin',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    return { accessToken, user };
  }

  async resetPassword(username: string, newPassword: string): Promise<void> {
    if (!this.db.isConnected) throw new Error('Database not connected');
    const user = await this.users.findByUsername(username);
    if (!user) throw new Error(`User not found: ${username}`);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.update(user.id, { passwordHash });
  }

  toDto(user: {
    id: string;
    username: string;
    role: 'admin' | 'user';
    createdAt: Date;
    updatedAt: Date;
  }): UserDto {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
