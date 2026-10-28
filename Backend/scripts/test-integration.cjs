const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

// This command owns its replica set. It never connects to MONGODB_URI or a
// developer-supplied TEST_MONGODB_URI, and removes its temporary data on exit.
async function main() {
  const backend = path.resolve(__dirname, '..');
  const cache = path.resolve(backend, '../.tmp/mongodb-binaries');
  fs.mkdirSync(cache, { recursive: true });
  const replica = await MongoMemoryReplSet.create({
    binary: {
      version: process.env.MONGOMS_VERSION || '7.0.24',
      downloadDir: cache,
      ...(process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : {})
    },
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });
  let child;
  const stop = async () => {
    if (child && child.exitCode === null) child.kill();
    await replica.stop();
  };
  const interrupted = async () => { await stop(); process.exit(130); };
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    const files = fs.readdirSync(path.join(backend, 'tests'))
      .filter(file => file.endsWith('.test.js')).sort()
      .map(file => path.join('tests', file));
    child = spawn(process.execPath, ['--test', ...files], {
      cwd: backend,
      windowsHide: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MONGODB_URI: replica.getUri(),
        JWT_SECRET: 'disposable-integration-tests-only',
        EMAIL_MODE: 'file',
        BACKEND_URL: 'http://127.0.0.1:5000',
        FRONTEND_URL: 'http://127.0.0.1:5000',
        EMAIL_OUTBOX_DIR: path.resolve(backend, '../.tmp/test-email-outbox')
      }
    });
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => resolve(code === null ? 1 : code));
    });
  } finally {
    process.removeListener('SIGINT', interrupted);
    process.removeListener('SIGTERM', interrupted);
    await stop();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
