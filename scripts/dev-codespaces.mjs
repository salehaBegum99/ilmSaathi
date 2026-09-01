import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (process.env.CODESPACES !== 'true') {
  throw new Error('dev:codespaces is only for GitHub Codespaces. Use npm run dev:native locally.');
}

const codespaceName = process.env.CODESPACE_NAME;
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
if (!codespaceName || !forwardingDomain) {
  throw new Error('GitHub Codespaces forwarding environment variables are unavailable.');
}

const databaseName = process.env.MONGODB_DB_NAME || 'ilmsaathi';
const mongoUri =
  process.env.MONGODB_URI ||
  `mongodb://mongo:27017/${encodeURIComponent(databaseName)}?replicaSet=rs0`;
const webOrigin = `https://${codespaceName}-5173.${forwardingDomain}`;
const runtimeEnvironment = {
  ...process.env,
  NODE_ENV: 'development',
  MONGODB_URI: mongoUri,
  MONGODB_DB_NAME: databaseName,
  WEB_URL: webOrigin,
  API_URL: 'http://localhost:4000',
  API_INTERNAL_URL: 'http://localhost:4000',
  CORS_ORIGINS: [webOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'].join(','),
  COOKIE_SECURE: 'true',
  COOKIE_SAME_SITE: 'lax',
  VITE_API_BASE_URL: '/api/v1',
};

async function waitForMongo() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 2_000,
      serverSelectionTimeoutMS: 2_000,
    });
    try {
      await client.connect();
      const hello = await client.db('admin').command({ hello: 1 });
      if (hello.setName === 'rs0' && hello.isWritablePrimary) return;
      lastError = new Error('MongoDB replica set is not primary yet.');
    } catch (error) {
      lastError = error;
    } finally {
      await client.close().catch(() => undefined);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error('Codespaces MongoDB did not become ready in time.', { cause: lastError });
}

function npmProcess(argumentsList) {
  const npmCliPath = process.env.npm_execpath;
  return spawn(
    npmCliPath ? process.execPath : 'npm',
    npmCliPath ? [npmCliPath, ...argumentsList] : argumentsList,
    {
      cwd: repositoryRoot,
      env: runtimeEnvironment,
      stdio: 'inherit',
    },
  );
}

function runNpm(argumentsList) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = npmProcess(argumentsList);
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`npm ${argumentsList.join(' ')} stopped by ${signal}`));
      } else if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`npm ${argumentsList.join(' ')} exited with code ${code}`));
      }
    });
  });
}

await waitForMongo();
console.info('Codespaces MongoDB rs0 is ready.');
await runNpm(['run', 'seed']);
console.info(`IlmSaathi web will open at ${webOrigin}`);

const developmentProcess = npmProcess(['run', 'dev']);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => developmentProcess.kill(signal));
}
developmentProcess.once('error', (error) => {
  console.error('Could not start IlmSaathi in Codespaces:', error.message);
  process.exitCode = 1;
});
developmentProcess.once('exit', (code, signal) => {
  if (signal) console.error(`IlmSaathi development processes stopped by ${signal}.`);
  process.exitCode = code ?? 1;
});
