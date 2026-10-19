export interface HealthSnapshot {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

export interface RuntimeHealthPort {
  getTimestampIso(): string;
  getUptimeSeconds(): number;
}
