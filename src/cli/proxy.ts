import { env } from 'node:process';
import is from '@sindresorhus/is';
import { createGlobalProxyAgent } from 'global-agent';

const envVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];

let agent = false;

export function bootstrap(): void {
  for (const envVar of envVars) {
    const lKey = envVar.toLowerCase();
    if (is.undefined(env[envVar]) && is.nonEmptyString(env[lKey])) {
      env[envVar] = env[lKey];
    }

    if (env[envVar]) {
      env[lKey] = env[envVar];
    }
  }

  if (is.nonEmptyString(env.HTTP_PROXY) || is.nonEmptyString(env.HTTPS_PROXY)) {
    createGlobalProxyAgent({
      environmentVariableNamespace: '',
    });
    agent = true;
  } else {
    // for testing only, does not reset global agent
    agent = false;
  }
}

// will be used by our http layer later
export function hasProxy(): boolean {
  return agent === true;
}
