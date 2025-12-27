import { AuditAction } from '../Enums/audit-actions.enum';
import { AuditResult } from './../Enums/audit-result.enum';
import {
  IsEnum,
  IsIP,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  IsObject,
} from 'class-validator';

export class CreateAuditDto {
  @IsNotEmpty()
  @IsEnum(AuditAction)
  action: AuditAction;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @Length(3, 512)
  userAgent?: string;

  @IsOptional()
  @IsEnum(AuditResult)
  result?: AuditResult;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
