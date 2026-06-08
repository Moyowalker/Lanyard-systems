import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateLeadInput, LeadListQuery, LeadStatus, LeadSummaryDto } from '@lanyard/contracts';

import { Lead } from '../infrastructure/content.schemas';

@Injectable()
export class LeadService {
  constructor(@InjectModel(Lead.name) private readonly leadModel: Model<Lead>) {}

  async capture(input: CreateLeadInput): Promise<LeadSummaryDto> {
    const lead = await this.leadModel.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.message,
      source: input.source ?? 'contact',
      topic: input.topic,
      branch: input.branch,
      status: LeadStatus.NEW,
    });

    return this.toSummary(lead);
  }

  async listAdmin(query: LeadListQuery): Promise<{ data: LeadSummaryDto[] }> {
    const rows = await this.leadModel.find().sort({ createdAt: -1 }).limit(query.limit).lean();
    return {
      data: rows.map((row) => this.toSummary(row)),
    };
  }

  private toSummary(lead: {
    _id?: unknown;
    id?: string;
    name: string;
    email?: string;
    phone?: string;
    message?: string;
    source?: string;
    topic?: string;
    branch?: string;
    status: string;
    createdAt?: Date;
  }): LeadSummaryDto {
    return {
      id: lead.id ?? String(lead._id),
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      message: lead.message,
      source: lead.source,
      topic: lead.topic,
      branch: lead.branch,
      status: lead.status,
      createdAt: (lead.createdAt ?? new Date()).toISOString(),
    };
  }
}