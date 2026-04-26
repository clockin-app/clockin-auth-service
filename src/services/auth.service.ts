import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as bcrypt from 'bcrypt';
import { RefreshToken } from '../entities/refresh-token.entity';
import { LoginDto } from '../dto/login.dto';
import { EmployeePayload, JwtPayload } from '../interfaces/auth.interfaces';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async login(
    dto: LoginDto,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const employeeServiceUrl = this.configService.get<string>(
      'EMPLOYEE_SERVICE_URL',
    );

    let employee: EmployeePayload;
    try {
      const response = await firstValueFrom(
        this.httpService.get<EmployeePayload>(
          `${employeeServiceUrl}/employees/by-email/${dto.email}`,
        ),
      );
      employee = response.data;
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!employee || !employee.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, employee.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    const payload: JwtPayload = {
      sub: employee.id,
      email: employee.email,
      role: employee.role,
    };

    const accessExpiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') ?? '15m';
    const refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';

    const access_token = this.jwtService.sign(payload, {
      expiresIn: accessExpiresIn as never,
    });

    const refresh_token = this.jwtService.sign(payload, {
      expiresIn: refreshExpiresIn as never,
    });

    const hashedRefresh = await bcrypt.hash(refresh_token, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const tokenEntity = this.refreshTokenRepo.create({
      employee_id: employee.id,
      token: hashedRefresh,
      expires_at: expiresAt,
    });
    await this.refreshTokenRepo.save(tokenEntity);

    return { access_token, refresh_token };
  }

  async refresh(refreshToken: string): Promise<{ access_token: string }> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const stored = await this.refreshTokenRepo.find({
      where: { employee_id: payload.sub },
    });

    let validRecord: RefreshToken | null = null;
    for (const record of stored) {
      const match = await bcrypt.compare(refreshToken, record.token);
      if (match) {
        validRecord = record;
        break;
      }
    }

    if (!validRecord || validRecord.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const accessExpiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') ?? '15m';

    const access_token = this.jwtService.sign(
      { sub: payload.sub, email: payload.email, role: payload.role },
      { expiresIn: accessExpiresIn as never },
    );

    return { access_token };
  }

  async logout(employeeId: string): Promise<void> {
    await this.refreshTokenRepo.delete({ employee_id: employeeId });
  }
}
