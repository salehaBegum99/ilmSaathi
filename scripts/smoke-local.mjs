import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MongoClient, ObjectId } from 'mongodb';

const projectRoot = new URL('../', import.meta.url);
const envText = await readFile(new URL('.env', projectRoot), 'utf8');

function readEnvValue(name) {
  if (process.env[name]) return process.env[name];
  const prefix = `${name}=`;
  const line = envText.split(/\r?\n/).find((candidate) => candidate.trimStart().startsWith(prefix));
  if (!line) throw new Error(`${name} is missing from .env`);
  const value = line.trimStart().slice(prefix.length).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

const apiBaseUrl = readEnvValue('API_URL').replace(/\/$/, '');
const mongoUri = readEnvValue('MONGODB_URI');
const termsVersion = readEnvValue('CURRENT_TERMS_VERSION');
const privacyVersion = readEnvValue('CURRENT_PRIVACY_VERSION');
const smokeEmail = `local-smoke-${randomUUID()}@example.test`;
const cookies = new Map();
let smokeUserId = null;

function absorbCookies(response) {
  for (const setCookie of response.headers.getSetCookie()) {
    const pair = setCookie.split(';', 1)[0];
    if (!pair) continue;
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader() {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function apiRequest(path, { method = 'GET', body, csrf = false } = {}) {
  const headers = new Headers({ accept: 'application/json' });
  if (cookies.size > 0) headers.set('cookie', cookieHeader());
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (csrf) {
    const token = cookies.get('lp_csrf');
    if (!token) throw new Error('The API did not issue a CSRF cookie');
    headers.set('x-csrf-token', token);
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  absorbCookies(response);
  const responseText = await response.text();
  let result = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      result = responseText;
    }
  }
  if (!response.ok) {
    const errorCode =
      typeof result === 'object' && result !== null && 'error' in result
        ? result.error?.code
        : null;
    throw new Error(
      `${method} ${path} failed with ${response.status}${errorCode ? ` (${errorCode})` : ''}`,
    );
  }
  return result;
}

async function cleanupSmokeAccount() {
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3_000 });
  try {
    await client.connect();
    const databaseName = new URL(mongoUri).pathname.slice(1) || 'ilmsaathi';
    const database = client.db(databaseName);
    let userObjectId =
      smokeUserId && ObjectId.isValid(smokeUserId) ? new ObjectId(smokeUserId) : null;
    if (!userObjectId) {
      const user = await database
        .collection('users')
        .findOne({ email: smokeEmail }, { projection: { _id: 1 } });
      userObjectId = user?._id ?? null;
    }
    if (!userObjectId) return;
    const application = await database
      .collection('educator_applications')
      .findOne({ educatorId: userObjectId }, { projection: { _id: 1 } });
    if (application?._id) {
      await database.collection('educator_application_history').deleteMany({
        applicationId: application._id,
      });
    }
    await Promise.all([
      database.collection('public_educators').deleteMany({ educatorId: userObjectId }),
      database.collection('educator_applications').deleteMany({ educatorId: userObjectId }),
      database.collection('auth_sessions').deleteMany({ userId: userObjectId }),
      database.collection('consent_events').deleteMany({ userId: userObjectId }),
      database.collection('profiles').deleteMany({ userId: userObjectId }),
      database.collection('users').deleteOne({ _id: userObjectId, email: smokeEmail }),
    ]);
  } finally {
    await client.close();
  }
}

try {
  await apiRequest('/api/health/ready');
  const csrfBootstrap = await apiRequest('/api/v1/auth/csrf');
  if (
    csrfBootstrap.termsVersion !== termsVersion ||
    csrfBootstrap.privacyVersion !== privacyVersion
  ) {
    throw new Error('The API consent versions do not match the local environment');
  }
  const registration = await apiRequest('/api/v1/auth/register', {
    method: 'POST',
    csrf: true,
    body: {
      email: smokeEmail,
      password: 'Local-smoke-password-123',
      role: 'educator',
      age18Confirmed: true,
      termsVersion,
      privacyVersion,
    },
  });
  smokeUserId = registration.user.id;
  const subjectResult = await apiRequest('/api/v1/subjects');
  const subjectId = subjectResult.subjects?.[0]?.id;
  if (!subjectId) throw new Error('The subject catalogue is empty; run npm run seed');
  await apiRequest('/api/v1/profiles/me/onboarding', {
    method: 'PUT',
    csrf: true,
    body: {
      displayName: 'Local Smoke Educator',
      preferredLanguage: 'en',
      timezone: 'Asia/Kolkata',
      learningGoals: ['Validate local educator workflow'],
      subjectIds: [subjectId],
    },
  });
  await apiRequest('/api/v1/educators/me/application', {
    method: 'PUT',
    csrf: true,
    body: {
      biography:
        'I am a temporary local smoke-test educator profile used to verify the complete application workflow and transaction support.',
      languages: ['en'],
      timezone: 'Asia/Kolkata',
      subjectClaims: [
        {
          subjectId,
          qualificationSummary: 'Local smoke-test qualification',
          experienceSummary: 'Local smoke-test teaching experience',
        },
      ],
    },
  });
  const submission = await apiRequest('/api/v1/educators/me/application/submit', {
    method: 'POST',
    csrf: true,
  });
  if (submission.application?.status !== 'submitted') {
    throw new Error('Educator application did not reach submitted status');
  }
  console.info(
    'Local smoke test passed: health, auth, database, onboarding and educator transaction.',
  );
} finally {
  await cleanupSmokeAccount();
}
