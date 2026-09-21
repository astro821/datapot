import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth/auth.service';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';
import { UserStore } from './user.store';

class CreateUserDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(4)
  password!: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: 'admin' | 'user';
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: 'admin' | 'user';
}

@Controller('users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UsersController {
  constructor(
    private readonly users: UserStore,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async list() {
    const rows = await this.users.findAll();
    return rows.map((u) => this.auth.toDto(u));
  }

  @Post()
  async create(@Body() body: CreateUserDto) {
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await this.users.create({
      username: body.username,
      passwordHash,
      role: body.role || 'user',
    });
    return this.auth.toDto(user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    const patch: { username?: string; passwordHash?: string; role?: 'admin' | 'user' } = {};
    if (body.username) patch.username = body.username;
    if (body.role) patch.role = body.role;
    if (body.password) patch.passwordHash = await bcrypt.hash(body.password, 10);
    const user = await this.users.update(id, patch);
    if (!user) throw new NotFoundException('User not found');
    return this.auth.toDto(user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const ok = await this.users.delete(id);
    if (!ok) throw new NotFoundException('User not found');
    return { ok: true };
  }
}
