import { env } from 'node:process';
import { isNonEmptyString, isUndefined } from '@sindresorhus/is';
import { createGlobalProxyAgent } from 'global-agent';

const envVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];

export function bootstrap(): void {
  for (const envVar of envVars) {
    const lKey = envVar.toLowerCase();
    if (isUndefined(env[envVar]) && isNonEmptyString(env[lKey])) {
      env[envVar] = env[lKey];
    }

    if (env[envVar]) {
      env[lKey] = env[envVar];
    }
  }

  if (isNonEmptyString(env.HTTP_PROXY) || isNonEmptyString(env.HTTPS_PROXY)) {
    createGlobalProxyAgent({
      environmentVariableNamespace: '',
    });
  }
}
