import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootPackage = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
const requestedScript = process.argv[2];
const parallel = process.argv.includes('--parallel');
const scopeIndex = process.argv.indexOf('--scope');
const requestedScope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : undefined;
const separatorIndex = process.argv.indexOf('--');
const forwardedArguments = separatorIndex >= 0 ? process.argv.slice(separatorIndex + 1) : [];
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmCliPath = process.env.npm_execpath;

function loadRootEnvironment() {
  const envPath = join(repositoryRoot, '.env');
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/u)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)=(.*)\s*$/u.exec(line);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadRootEnvironment();

if (!requestedScript) {
  console.error(
    'Usage: node scripts/run-workspaces.mjs <script> [--parallel] [--scope <name-or-path>] [-- <args>]',
  );
  process.exit(2);
}

if (scopeIndex >= 0 && !requestedScope) {
  console.error('--scope requires a workspace package name or relative path');
  process.exit(2);
}

function expandWorkspacePattern(pattern) {
  const normalized = pattern.replaceAll('\\', '/').replace(/\/+$/u, '');

  if (!normalized.endsWith('/*')) {
    const candidate = resolve(repositoryRoot, normalized);
    return existsSync(join(candidate, 'package.json')) ? [candidate] : [];
  }

  const parent = resolve(repositoryRoot, normalized.slice(0, -2));
  if (!existsSync(parent)) {
    return [];
  }

  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(parent, entry.name))
    .filter((directory) => existsSync(join(directory, 'package.json')));
}

const discoveredWorkspaces = [...new Set((rootPackage.workspaces ?? []).flatMap(expandWorkspacePattern))]
  .map((directory) => {
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    return { directory, manifest };
  });

const workspaceByName = new Map(
  discoveredWorkspaces.map((workspace) => [workspace.manifest.name, workspace]),
);

function workspaceDependencies(workspace) {
  const dependencyNames = new Set([
    ...Object.keys(workspace.manifest.dependencies ?? {}),
    ...Object.keys(workspace.manifest.devDependencies ?? {}),
    ...Object.keys(workspace.manifest.optionalDependencies ?? {}),
  ]);
  return [...dependencyNames]
    .map((name) => workspaceByName.get(name))
    .filter((dependency) => dependency !== undefined);
}

function orderDependenciesFirst(workspaces) {
  const selectedDirectories = new Set(workspaces.map(({ directory }) => directory));
  const permanent = new Set();
  const temporary = new Set();
  const ordered = [];

  function visit(workspace) {
    if (permanent.has(workspace.directory)) {
      return;
    }
    if (temporary.has(workspace.directory)) {
      throw new Error('Workspace dependency cycle includes ' + workspace.manifest.name);
    }

    temporary.add(workspace.directory);
    for (const dependency of workspaceDependencies(workspace)) {
      if (selectedDirectories.has(dependency.directory)) {
        visit(dependency);
      }
    }
    temporary.delete(workspace.directory);
    permanent.add(workspace.directory);
    ordered.push(workspace);
  }

  for (const workspace of workspaces) {
    visit(workspace);
  }
  return ordered;
}

const matchingWorkspaces = discoveredWorkspaces.filter(({ directory, manifest }) => {
  if (!manifest.scripts?.[requestedScript]) {
    return false;
  }
  if (!requestedScope) {
    return true;
  }
  const workspacePath = relative(repositoryRoot, directory).replaceAll('\\', '/');
  return manifest.name === requestedScope || workspacePath === requestedScope.replaceAll('\\', '/');
});
const workspaces = parallel ? matchingWorkspaces : orderDependenciesFirst(matchingWorkspaces);

if (workspaces.length === 0) {
  const scopeMessage = requestedScope ? ` in scope "${requestedScope}"` : '';
  console.error(`No workspace defines the "${requestedScript}" script${scopeMessage}.`);
  process.exit(2);
}

const activeChildren = new Set();

function runWorkspace(workspace) {
  const workspacePath = relative(repositoryRoot, workspace.directory).replaceAll('\\', '/');
  console.log(
    '\n> ' + workspace.manifest.name + ' (' + workspacePath + '): npm run ' + requestedScript,
  );

  return new Promise((resolvePromise) => {
    const npmArguments = ['run', requestedScript, '--workspace', workspacePath, ...forwardedArguments];
    const child = spawn(
      npmCliPath ? process.execPath : npmCommand,
      npmCliPath ? [npmCliPath, ...npmArguments] : npmArguments,
      {
        cwd: repositoryRoot,
        env: process.env,
        stdio: 'inherit',
      },
    );

    activeChildren.add(child);
    child.once('error', (error) => {
      activeChildren.delete(child);
      console.error(workspace.manifest.name + ': failed to start: ' + error.message);
      resolvePromise(1);
    });
    child.once('exit', (code, signal) => {
      activeChildren.delete(child);
      if (signal) {
        console.error(workspace.manifest.name + ': terminated by ' + signal);
      }
      resolvePromise(code ?? 1);
    });
  });
}

function stopChildren(signal) {
  for (const child of activeChildren) {
    child.kill(signal);
  }
}

process.once('SIGINT', () => stopChildren('SIGINT'));
process.once('SIGTERM', () => stopChildren('SIGTERM'));

let exitCodes;
if (parallel) {
  exitCodes = await Promise.all(workspaces.map(runWorkspace));
} else {
  exitCodes = [];
  for (const workspace of workspaces) {
    const code = await runWorkspace(workspace);
    exitCodes.push(code);
    if (code !== 0) {
      break;
    }
  }
}

process.exitCode = exitCodes.some((code) => code !== 0) ? 1 : 0;
