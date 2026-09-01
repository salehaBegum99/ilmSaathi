import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const environmentPath = join(repositoryRoot, '.env');
const dataDirectory = join(repositoryRoot, 'data', 'mongodb-native');
const logPath = join(dataDirectory, 'mongod.log');
const pidPath = join(dataDirectory, 'mongod.pid');
const replicaSetName = 'rs0';

function readEnvironment() {
  const values = new Map();
  if (!existsSync(environmentPath)) {
    return values;
  }
  for (const line of readFileSync(environmentPath, 'utf8').split(/\r?\n/u)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (match) values.set(match[1], match[2].trim());
  }
  return values;
}

function nativeSettings() {
  const environment = readEnvironment();
  const port = Number(environment.get('MONGO_NATIVE_PORT') || 27018);
  const database = environment.get('MONGO_DATABASE') || 'ilmsaathi';
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('MONGO_NATIVE_PORT must be a valid TCP port.');
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(database)) {
    throw new Error('MONGO_DATABASE contains unsupported characters.');
  }
  return { database, port };
}

function nativeUri({ database, port }) {
  return (
    'mongodb://127.0.0.1:' +
    port +
    '/' +
    encodeURIComponent(database) +
    '?replicaSet=' +
    replicaSetName +
    '&directConnection=true'
  );
}

function updateNativeEnvironment(settings) {
  if (!existsSync(environmentPath)) {
    throw new Error('Missing .env. Run npm run env:generate first.');
  }
  const lines = readFileSync(environmentPath, 'utf8').split(/\r?\n/u);
  let portWritten = false;
  let uriWritten = false;
  const rendered = [];
  for (const line of lines) {
    if (line.startsWith('MONGO_NATIVE_PORT=')) {
      rendered.push('MONGO_NATIVE_PORT=' + settings.port);
      portWritten = true;
    } else if (line.startsWith('MONGODB_URI=')) {
      rendered.push('MONGODB_URI=' + nativeUri(settings));
      uriWritten = true;
    } else {
      rendered.push(line);
      if (line.startsWith('MONGO_PORT=') && !portWritten) {
        rendered.push('MONGO_NATIVE_PORT=' + settings.port);
        portWritten = true;
      }
    }
  }
  if (!uriWritten) throw new Error('.env is missing MONGODB_URI.');
  const temporaryPath = environmentPath + '.native-' + process.pid;
  writeFileSync(temporaryPath, rendered.join('\n').replace(/\n*$/u, '\n'), {
    encoding: 'utf8',
    mode: 0o600,
  });
  renameSync(temporaryPath, environmentPath);
  try {
    chmodSync(environmentPath, 0o600);
  } catch {
    // Windows ACLs do not map exactly to POSIX modes.
  }
  process.env.MONGODB_URI = nativeUri(settings);
  process.env.MONGODB_DB_NAME = settings.database;
}

function findMongod() {
  const override = process.env.MONGOD_PATH;
  if (override && existsSync(override) && statSync(override).isFile()) return resolve(override);

  const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['mongod'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (lookup.status === 0) {
    const match = lookup.stdout.split(/\r?\n/u).find(Boolean);
    if (match && existsSync(match.trim())) return resolve(match.trim());
  }

  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const serverRoot = join(programFiles, 'MongoDB', 'Server');
    if (existsSync(serverRoot)) {
      const versions = readdirSync(serverRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
      for (const version of versions) {
        const candidate = join(serverRoot, version, 'bin', 'mongod.exe');
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  throw new Error(
    'mongod was not found. Install MongoDB Community Server or set MONGOD_PATH to mongod.exe.',
  );
}

function directUri(port) {
  return 'mongodb://127.0.0.1:' + port + '/admin?directConnection=true';
}

async function connectDirect(port, timeout = 1_000) {
  const client = new MongoClient(directUri(port), {
    connectTimeoutMS: timeout,
    serverSelectionTimeoutMS: timeout,
  });
  await client.connect();
  return client;
}

function samePath(left, right) {
  const normalizePath = (value) => normalize(resolve(value)).replace(/[\\/]+$/u, '').toLowerCase();
  return normalizePath(left) === normalizePath(right);
}

async function verifyProjectInstance(client) {
  const options = await client.db('admin').command({ getCmdLineOpts: 1 });
  const configuredPath = options?.parsed?.storage?.dbPath;
  if (!configuredPath || !samePath(configuredPath, dataDirectory)) {
    throw new Error(
      'Port belongs to a different MongoDB process. Change MONGO_NATIVE_PORT or stop that process.',
    );
  }
}

async function initializeReplicaSet(port) {
  const deadline = Date.now() + 35_000;
  let initiated = false;

  while (Date.now() < deadline) {
    let client;
    try {
      client = await connectDirect(port);
      await verifyProjectInstance(client);
      const hello = await client.db('admin').command({ hello: 1 });
      if (hello.setName === replicaSetName && hello.isWritablePrimary) {
        return;
      }
      if (!hello.setName && !initiated) {
        try {
          await client.db('admin').command({
            replSetInitiate: {
              _id: replicaSetName,
              members: [{ _id: 0, host: '127.0.0.1:' + port }],
            },
          });
        } catch (error) {
          if (error?.codeName !== 'AlreadyInitialized' && error?.code !== 23) throw error;
        }
        initiated = true;
      } else if (hello.setName && hello.setName !== replicaSetName) {
        throw new Error('Native MongoDB uses an unexpected replica-set name: ' + hello.setName);
      }
    } catch (error) {
      const message = String(error?.message || error);
      if (
        !message.includes('ECONNREFUSED') &&
        !message.includes('Server selection timed out') &&
        !message.includes('connection')
      ) {
        throw error;
      }
    } finally {
      await client?.close().catch(() => undefined);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 600));
  }

  const detail = existsSync(logPath)
    ? readFileSync(logPath, 'utf8').split(/\r?\n/u).slice(-12).join('\n')
    : 'MongoDB did not create a log file.';
  throw new Error('Native MongoDB did not become primary in time.\n' + detail);
}

export async function startNativeMongo() {
  const settings = nativeSettings();
  mkdirSync(dataDirectory, { recursive: true });
  updateNativeEnvironment(settings);

  try {
    const existing = await connectDirect(settings.port);
    try {
      await verifyProjectInstance(existing);
      const hello = await existing.db('admin').command({ hello: 1 });
      if (hello.setName === replicaSetName && hello.isWritablePrimary) {
        console.log('Native MongoDB is already ready on 127.0.0.1:' + settings.port + '.');
        return;
      }
    } finally {
      await existing.close();
    }
    await initializeReplicaSet(settings.port);
    console.log('Native MongoDB rs0 is ready on 127.0.0.1:' + settings.port + '.');
    return;
  } catch (error) {
    if (!String(error?.message || error).includes('ECONNREFUSED')) {
      if (!String(error?.message || error).includes('Server selection timed out')) throw error;
    }
  }

  const mongodPath = findMongod();
  const child = spawn(
    mongodPath,
    [
      '--dbpath',
      dataDirectory,
      '--logpath',
      logPath,
      '--logappend',
      '--port',
      String(settings.port),
      '--bind_ip',
      '127.0.0.1',
      '--replSet',
      replicaSetName,
    ],
    { detached: true, stdio: 'ignore', windowsHide: true },
  );
  child.unref();
  writeFileSync(pidPath, String(child.pid), 'utf8');
  await initializeReplicaSet(settings.port);
  console.log('Native MongoDB rs0 is ready on 127.0.0.1:' + settings.port + '.');
  console.log('Local database files: ' + dataDirectory);
}

export async function nativeMongoStatus() {
  const settings = nativeSettings();
  const client = await connectDirect(settings.port, 1_500);
  try {
    await verifyProjectInstance(client);
    const hello = await client.db('admin').command({ hello: 1 });
    console.log(
      'Native MongoDB status: ' +
        (hello.isWritablePrimary ? 'ready' : 'starting') +
        ', replica set ' +
        (hello.setName || 'not initialized') +
        ', port ' +
        settings.port +
        '.',
    );
  } finally {
    await client.close();
  }
}

export async function stopNativeMongo() {
  const settings = nativeSettings();
  let client;
  try {
    client = await connectDirect(settings.port, 1_500);
    await verifyProjectInstance(client);
    await client.db('admin').command({ shutdown: 1, force: true });
  } catch (error) {
    const message = String(error?.message || error);
    if (!message.includes('connection') && !message.includes('ECONNREFUSED')) throw error;
  } finally {
    await client?.close().catch(() => undefined);
    if (existsSync(pidPath)) unlinkSync(pidPath);
  }
  console.log('Native MongoDB is stopped. Local data was kept.');
}

const command = process.argv[2] || 'start';
if (command === 'start') await startNativeMongo();
else if (command === 'status') await nativeMongoStatus();
else if (command === 'stop') await stopNativeMongo();
else throw new Error('Usage: node scripts/native-mongo.mjs <start|status|stop>');
