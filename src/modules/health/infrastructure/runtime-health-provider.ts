import { type RuntimeHealthPort } from '../domain/health-snapshot';

export class RuntimeHealthProvider implements RuntimeHealthPort {
  public getTimestampIso(): string {
    return new Date().toISOString();
  }

  public getUptimeSeconds(): number {
    return process.uptime();
  }
}
