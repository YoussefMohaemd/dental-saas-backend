import { type HealthSnapshot, type RuntimeHealthPort } from '../domain/health-snapshot';

export function getHealthSnapshot(runtimeHealthPort: RuntimeHealthPort): HealthSnapshot {
  return {
    status: 'ok',
    uptimeSeconds: runtimeHealthPort.getUptimeSeconds(),
    timestamp: runtimeHealthPort.getTimestampIso(),
  };
}
