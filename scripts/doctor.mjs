import { spawnSync } from 'node:child_process';
import { promises as dns } from 'node:dns';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentsList = process.argv.slice(2);
const strict = argumentsList.includes('--strict');
const skipNetwork = argumentsList.includes('--skip-network');
const requireDocker = argumentsList.includes('--require-docker');
const supportedArguments = new Set(['--strict', '--skip-network', '--require-docker']);
const unknownArgument = argumentsList.find((argument) => !supportedArguments.has(argument));
if (unknownArgument) {
  throw new Error('Unknown argument: ' + unknownArgument);
}

let failures = 0;
let warnings = 0;

function ok(message) {
  console.log('[OK]   ' + message);
}

function warn(message) {
  warnings += 1;
  console.warn('[WARN] ' + message);
}

function fail(message) {
  failures += 1;
  console.error('[FAIL] ' + message);
}

function info(message) {
  console.log('[INFO] ' + message);
}

function parseEnv(path) {
  const values = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)=(.*)\s*$/u.exec(line);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function commandVersion(command, args = ['--version']) {
  let executable = process.platform === 'win32' && command === 'docker' ? 'docker.exe' : command;
  let effectiveArguments = args;
  if (command === 'npm') {
    const bundledNpmCli = join(
      dirname(process.execPath),
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    );
    const npmCli = process.env.npm_execpath || (existsSync(bundledNpmCli) ? bundledNpmCli : null);
    if (npmCli) {
      executable = process.execPath;
      effectiveArguments = [npmCli, ...args];
    } else if (process.platform === 'win32') {
      executable = 'npm.cmd';
    }
  }
  const result = spawnSync(executable, effectiveArguments, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
    timeout: 5_000,
  });
  return result.status === 0 ? (result.stdout || result.stderr).trim() : null;
}

function tcpProbe(host, port, timeout = 2_500) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      rejectPromise(new Error('timed out'));
    }, timeout);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolvePromise();
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
  });
}

async function mongoTarget(uri) {
  const parsed = new URL(uri);
  if (parsed.protocol === 'mongodb+srv:') {
    const records = await dns.resolveSrv('_mongodb._tcp.' + parsed.hostname);
    if (records.length === 0) {
      throw new Error('SRV record returned no hosts');
    }
    return { parsed, host: records[0].name, port: records[0].port };
  }
  if (parsed.protocol !== 'mongodb:') {
    throw new Error('expected mongodb:// or mongodb+srv://');
  }
  return { parsed, host: parsed.hostname, port: Number(parsed.port || 27_017) };
}

function parseHttpOrigin(value, key) {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('must use http:// or https://');
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('must be a plain origin without credentials, query or fragment');
    }
    if (parsed.pathname !== '/') {
      throw new Error('must not include a path');
    }
    return parsed;
  } catch (error) {
    fail(key + ' is invalid: ' + error.message);
    return null;
  }
}

function databaseNameFromMongoUrl(parsed) {
  return decodeURIComponent(parsed.pathname.replace(/^\//u, '').split('/')[0] ?? '');
}

console.log('IlmSaathi environment doctor\n');

const requiredFiles = [
  'package.json',
  'package-lock.json',
  'tsconfig.base.json',
  '.env.example',
  '.env.production.example',
  'compose.yaml',
  '.devcontainer/devcontainer.json',
  '.devcontainer/compose.yaml',
  'apps/web/package.json',
  'apps/api/package.json',
  'packages/shared/package.json',
];
for (const path of requiredFiles) {
  if (existsSync(resolve(repositoryRoot, path))) {
    ok(path + ' exists');
  } else {
    fail(path + ' is missing');
  }
}

try {
  const rootPackage = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
  const workspaces = new Set(rootPackage.workspaces ?? []);
  if (workspaces.has('apps/*') && workspaces.has('packages/*')) {
    ok('npm workspace roots include apps/* and packages/*');
  } else {
    fail('package.json must include apps/* and packages/* npm workspace roots');
  }
} catch (error) {
  fail('package.json is invalid JSON: ' + error.message);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor === 22) {
  ok('Node.js ' + process.versions.node + ' matches the Node 22 baseline');
} else {
  fail('Node.js 22 is required; found ' + process.versions.node);
}

const npmVersion = commandVersion('npm');
if (npmVersion && Number(npmVersion.split('.')[0]) >= 10) {
  ok('npm ' + npmVersion + ' satisfies the npm 10+ baseline');
} else if (npmVersion) {
  fail('npm 10 or newer is required; found ' + npmVersion);
} else {
  fail('npm is not available on PATH');
}

const dockerVersion = commandVersion('docker');
if (dockerVersion) {
  ok(dockerVersion + ' is available');
  const composeVersion = commandVersion('docker', ['compose', 'version']);
  if (composeVersion) {
    ok(composeVersion + ' is available');
  } else if (requireDocker) {
    fail('Docker Compose v2 is required but unavailable');
  } else {
    warn('Docker Compose v2 is unavailable');
  }
} else if (requireDocker) {
  fail('Docker is required but unavailable');
} else {
  info('Docker is unavailable; native development still works with a reachable MongoDB');
}

const envPath = resolve(repositoryRoot, '.env');
if (!existsSync(envPath)) {
  fail('Missing .env; run npm run env:generate');
} else {
  const env = parseEnv(envPath);
  for (const key of env.keys()) {
    if (process.env[key] !== undefined) {
      env.set(key, process.env[key]);
    }
  }
  ok('.env exists');

  const requiredValues = [
    'NODE_ENV',
    'WEB_PORT',
    'API_PORT',
    'PORT',
    'WEB_URL',
    'API_URL',
    'API_INTERNAL_URL',
    'CORS_ORIGINS',
    'MONGO_PORT',
    'MONGO_NATIVE_PORT',
    'MONGO_DATABASE',
    'MONGODB_DB_NAME',
    'MONGO_REPLICA_SET_KEY',
    'MONGODB_URI',
    'MONGODB_URI_DOCKER',
    'MONGO_ROOT_USERNAME',
    'MONGO_ROOT_PASSWORD',
    'JWT_ACCESS_SECRET',
    'CSRF_SECRET',
    'AUDIT_HMAC_SECRET',
    'MFA_ENCRYPTION_KEY_BASE64',
    'CURRENT_TERMS_VERSION',
    'CURRENT_PRIVACY_VERSION',
    'VITE_API_BASE_URL',
  ];
  for (const key of requiredValues) {
    const value = env.get(key);
    if (!value) {
      fail(key + ' is empty in .env');
    } else if (/change[-_]?me|replace[-_]?me|<.+>/iu.test(value)) {
      fail(key + ' still contains a placeholder');
    }
  }

  const secretMinimums = new Map([
    ['MONGO_ROOT_PASSWORD', 24],
    ['MONGO_REPLICA_SET_KEY', 48],
    ['JWT_ACCESS_SECRET', 43],
    ['CSRF_SECRET', 43],
    ['AUDIT_HMAC_SECRET', 43],
  ]);
  for (const [key, minimum] of secretMinimums) {
    const value = env.get(key) ?? '';
    if (value && value.length < minimum) {
      fail(key + ' is shorter than the required local-development minimum');
    }
  }

  const mfaKey = env.get('MFA_ENCRYPTION_KEY_BASE64') ?? '';
  if (mfaKey) {
    const decoded = Buffer.from(mfaKey, 'base64');
    const canonical = decoded.toString('base64').replace(/=+$/u, '');
    if (decoded.byteLength !== 32 || canonical !== mfaKey.replace(/=+$/u, '')) {
      fail('MFA_ENCRYPTION_KEY_BASE64 must be valid base64 that decodes to exactly 32 bytes');
    }
  }

  const apiPort = Number(env.get('API_PORT'));
  const runtimePort = Number(env.get('PORT'));
  const webPort = Number(env.get('WEB_PORT'));
  const mongoPort = Number(env.get('MONGO_PORT'));
  const nativeMongoPort = Number(env.get('MONGO_NATIVE_PORT'));
  for (const [key, port] of [
    ['API_PORT', apiPort],
    ['PORT', runtimePort],
    ['WEB_PORT', webPort],
    ['MONGO_PORT', mongoPort],
    ['MONGO_NATIVE_PORT', nativeMongoPort],
  ]) {
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      fail(key + ' must be a valid TCP port');
    }
  }
  if (apiPort !== runtimePort) {
    fail('PORT must equal API_PORT so native and Compose API processes agree');
  }
  if (new Set([apiPort, webPort, mongoPort, nativeMongoPort]).size !== 4) {
    fail('API_PORT, WEB_PORT, MONGO_PORT and MONGO_NATIVE_PORT must be different');
  }

  const webUrl = env.get('WEB_URL') ? parseHttpOrigin(env.get('WEB_URL'), 'WEB_URL') : null;
  const apiUrl = env.get('API_URL') ? parseHttpOrigin(env.get('API_URL'), 'API_URL') : null;
  const internalUrl = env.get('API_INTERNAL_URL')
    ? parseHttpOrigin(env.get('API_INTERNAL_URL'), 'API_INTERNAL_URL')
    : null;
  if (webUrl && Number(webUrl.port || (webUrl.protocol === 'https:' ? 443 : 80)) !== webPort) {
    fail('WEB_URL port must equal WEB_PORT');
  }
  if (apiUrl && Number(apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80)) !== apiPort) {
    fail('API_URL port must equal API_PORT');
  }
  if (
    internalUrl &&
    Number(internalUrl.port || (internalUrl.protocol === 'https:' ? 443 : 80)) !== apiPort
  ) {
    fail('API_INTERNAL_URL port must equal API_PORT for native development');
  }

  const corsOrigins = (env.get('CORS_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const parsedCorsOrigins = corsOrigins
    .map((origin, index) => parseHttpOrigin(origin, 'CORS_ORIGINS[' + index + ']'))
    .filter(Boolean)
    .map((url) => url.origin);
  if (new Set(parsedCorsOrigins).size !== parsedCorsOrigins.length) {
    fail('CORS_ORIGINS contains duplicate origins');
  }
  if (webUrl && !parsedCorsOrigins.includes(webUrl.origin)) {
    fail('CORS_ORIGINS must include WEB_URL');
  }
  if (env.get('VITE_API_BASE_URL') !== '/api/v1') {
    fail('VITE_API_BASE_URL must be /api/v1 for the local same-origin proxy contract');
  }

  const localUri = env.get('MONGODB_URI');
  const dockerUri = env.get('MONGODB_URI_DOCKER');
  try {
    if (localUri) {
      const target = await mongoTarget(localUri);
      ok('MONGODB_URI is syntactically valid for ' + target.host + ':' + target.port);
      const localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(target.host);
      if (localHost && target.port !== nativeMongoPort) {
        fail('MONGODB_URI port must equal MONGO_NATIVE_PORT');
      }
      const database = databaseNameFromMongoUrl(target.parsed);
      if (database && database !== env.get('MONGODB_DB_NAME')) {
        fail('MONGODB_URI database must equal MONGODB_DB_NAME');
      }
      if (localHost && target.parsed.searchParams.get('replicaSet') !== 'rs0') {
        fail('Local MONGODB_URI must include replicaSet=rs0');
      }
      if (!skipNetwork) {
        try {
          await tcpProbe(target.host, target.port);
          ok('MongoDB TCP endpoint is reachable');
        } catch (error) {
          warn('MongoDB is not reachable yet: ' + error.message);
        }
      }
    }
  } catch (error) {
    fail('MONGODB_URI is invalid: ' + error.message);
  }

  try {
    if (dockerUri) {
      const target = await mongoTarget(dockerUri);
      if (target.host === 'mongo' && target.port === 27_017) {
        ok('MONGODB_URI_DOCKER targets mongo:27017');
      } else {
        fail('MONGODB_URI_DOCKER must target mongo:27017');
      }
      const database = databaseNameFromMongoUrl(target.parsed);
      if (database && database !== env.get('MONGODB_DB_NAME')) {
        fail('MONGODB_URI_DOCKER database must equal MONGODB_DB_NAME');
      }
      if (target.parsed.searchParams.get('replicaSet') !== 'rs0') {
        fail('MONGODB_URI_DOCKER must include replicaSet=rs0');
      }
    }
  } catch (error) {
    fail('MONGODB_URI_DOCKER is invalid: ' + error.message);
  }

  if (!skipNetwork && apiUrl) {
    try {
      const liveResponse = await fetch(apiUrl.origin + '/api/health/live', {
        signal: AbortSignal.timeout(2_500),
      });
      if (liveResponse.ok) {
        ok('API liveness endpoint is healthy');
        const readyResponse = await fetch(apiUrl.origin + '/api/health/ready', {
          signal: AbortSignal.timeout(2_500),
        });
        if (readyResponse.ok) {
          ok('API readiness endpoint is healthy');
        } else {
          warn('API readiness endpoint returned HTTP ' + readyResponse.status);
        }
      } else {
        warn('API liveness endpoint returned HTTP ' + liveResponse.status);
      }
    } catch {
      info('API is not running; HTTP health probes skipped');
    }
  }
}

console.log('\nSummary: ' + failures + ' failure(s), ' + warnings + ' warning(s).');
process.exitCode = failures > 0 || (strict && warnings > 0) ? 1 : 0;
