import {
  APPLICATION_ERROR_CODES,
  ApplicationError,
} from '../../../shared/application/errors/application-error';
import { type CapabilityMatchMode } from '../domain/assistant.types';

export class PermissionGuard {
  public hasRequiredCapabilities(
    effectiveCapabilities: ReadonlySet<string>,
    requiredCapabilities: readonly string[],
    mode: CapabilityMatchMode,
  ): boolean {
    if (requiredCapabilities.length === 0) {
      return true;
    }

    if (mode === 'any') {
      return requiredCapabilities.some((capability) => effectiveCapabilities.has(capability));
    }

    return requiredCapabilities.every((capability) => effectiveCapabilities.has(capability));
  }

  public assertCapabilities(
    effectiveCapabilities: ReadonlySet<string>,
    requiredCapabilities: readonly string[],
    mode: CapabilityMatchMode,
  ): void {
    const hasAccess = this.hasRequiredCapabilities(
      effectiveCapabilities,
      requiredCapabilities,
      mode,
    );

    if (hasAccess) {
      return;
    }

    throw new ApplicationError({
      message: 'Assistant tool permission denied',
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      expose: true,
      details: {
        requiredCapabilities,
        matchMode: mode,
      },
    });
  }
}
