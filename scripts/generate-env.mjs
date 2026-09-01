import {
  chmodSync,
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = resolve(repositoryRoot, '.env.example');
const argumentsList = process.argv.slice(2);
const force = argumentsList.includes('--force');
const outputFlagIndex = argumentsList.indexOf('--output');
if (outputFlagIndex >= 0 && !argumentsList[outputFlagIndex + 1]) {
  throw new Error('--output requires a file path.');
}
for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index];
  if (argument === '--force') {
    continue;
  }
  if (argument === '--output') {
    index += 1;
    continue;
  }
  throw new Error('Unknown argument: ' + argument);
}
const outputPath = resolve(
  repositoryRoot,
  outputFlagIndex >= 0 && argumentsList[outputFlagIndex + 1]
    ? argumentsList[outputFlagIndex + 1]
    : '.env',
);

function randomSecret(bytes = 48) {
  return randomBytes(bytes).toString('base64url');
}

if (!existsSync(templatePath)) {
  throw new Error('Missing .env.example; cannot generate a safe local environment.');
}
if (outputPath === templatePath) {
  throw new Error('Refusing to overwrite .env.example.');
}

if (existsSync(outputPath) && !force) {
  console.log(
    'Environment file already exists and was left unchanged: ' +
      outputPath +
      '\nUse --force only when you intentionally want to rotate all local secrets.',
  );
  process.exit(0);
}

if (existsSync(outputPath) && force) {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const backupPath = outputPath + '.backup-' + timestamp;
  copyFileSync(outputPath, backupPath);
  console.warn('Existing environment backed up to ' + backupPath);
}

const template = readFileSync(templatePath, 'utf8');
const templateValues = new Map();
for (const line of template.split(/\r?\n/u)) {
  const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
  if (match) {
    templateValues.set(match[1], match[2].trim());
  }
}

const mongoUsername = 'ilmsaathi_local';
const mongoPassword = randomSecret(32);
const mongoDatabase = templateValues.get('MONGO_DATABASE') || 'ilmsaathi';
const mongoPort = Number(templateValues.get('MONGO_PORT') || 27017);
const nativeMongoPort = Number(templateValues.get('MONGO_NATIVE_PORT') || 27018);
if (!Number.isInteger(mongoPort) || mongoPort < 1 || mongoPort > 65_535) {
  throw new Error('MONGO_PORT in .env.example must be a valid TCP port.');
}
if (!Number.isInteger(nativeMongoPort) || nativeMongoPort < 1 || nativeMongoPort > 65_535) {
  throw new Error('MONGO_NATIVE_PORT in .env.example must be a valid TCP port.');
}
if (!/^[A-Za-z0-9_-]+$/u.test(mongoDatabase)) {
  throw new Error('MONGO_DATABASE in .env.example contains unsupported characters.');
}
const encodedUsername = encodeURIComponent(mongoUsername);
const encodedPassword = encodeURIComponent(mongoPassword);
const encodedDatabase = encodeURIComponent(mongoDatabase);

const generatedValues = new Map([
  ['MONGO_ROOT_USERNAME', mongoUsername],
  ['MONGO_ROOT_PASSWORD', mongoPassword],
  ['MONGO_REPLICA_SET_KEY', randomBytes(64).toString('base64')],
  [
    'MONGODB_URI',
    'mongodb://' +
      '127.0.0.1:' +
      nativeMongoPort +
      '/' +
      encodedDatabase +
      '?replicaSet=rs0&directConnection=true',
  ],
  [
    'MONGODB_URI_DOCKER',
    'mongodb://' +
      encodedUsername +
      ':' +
      encodedPassword +
      '@mongo:27017/' +
      encodedDatabase +
      '?authSource=admin&replicaSet=rs0&directConnection=true',
  ],
  ['JWT_ACCESS_SECRET', randomSecret()],
  ['CSRF_SECRET', randomSecret()],
  ['AUDIT_HMAC_SECRET', randomSecret()],
  ['MFA_ENCRYPTION_KEY_BASE64', randomBytes(32).toString('base64')],
]);

for (const key of generatedValues.keys()) {
  if (!templateValues.has(key)) {
    throw new Error('.env.example is missing generated key ' + key);
  }
}

const rendered = template
  .split(/\r?\n/u)
  .map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) {
      return line;
    }

    const replacement = generatedValues.get(match[1]);
    return replacement === undefined ? line : match[1] + '=' + replacement;
  })
  .join('\n')
  .replace(/\n*$/u, '\n');

const temporaryPath = outputPath + '.tmp-' + process.pid;
writeFileSync(temporaryPath, rendered, { encoding: 'utf8', mode: 0o600 });
renameSync(temporaryPath, outputPath);
try {
  chmodSync(outputPath, 0o600);
} catch {
  // Windows ACLs do not map exactly to POSIX modes; the file is still Git-ignored.
}

console.log('Generated local environment at ' + outputPath);
console.log('Secrets were not printed. Keep this file out of Git.');
