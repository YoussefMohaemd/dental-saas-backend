import { type Response } from 'express';

import { type PaginationMeta } from '../../application/contracts/pagination';

export interface ResponseMeta {
  requestId?: string;
  pagination?: PaginationMeta;
}

export interface ApiSuccessEnvelope<TData> {
  data: TData;
  meta?: ResponseMeta;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: ResponseMeta;
}

export function sendOk<TData>(res: Response, data: TData, meta?: ResponseMeta): void {
  const payload: ApiSuccessEnvelope<TData> = meta ? { data, meta } : { data };
  res.status(200).json(payload);
}

export function sendCreated<TData>(res: Response, data: TData, meta?: ResponseMeta): void {
  const payload: ApiSuccessEnvelope<TData> = meta ? { data, meta } : { data };
  res.status(201).json(payload);
}

export function sendNoContent(res: Response): void {
  res.status(204).send();
}

export function sendError(res: Response, statusCode: number, envelope: ApiErrorEnvelope): void {
  res.status(statusCode).json(envelope);
}
