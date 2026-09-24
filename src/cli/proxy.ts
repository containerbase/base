import { env } from 'node:process';
import { isNonEmptyString, isUndefined } from '@sindresorhus/is';
import { createGlobalProxyAgent } from 'global-agent';

const envVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];

/**
 * Syncs the upper and lower case proxy environment variables, and installs a
 * global proxy agent when a http or https proxy is set.
 */
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
