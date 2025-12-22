import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './Models/audit-log.entity';
import { CreateAuditDto } from './Dtos/Create-audit.dto';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async logEvent(params: CreateAuditDto): Promise<void> {
    const log = this.auditRepo.create(params);
    await this.auditRepo.save(log);
  }
}
