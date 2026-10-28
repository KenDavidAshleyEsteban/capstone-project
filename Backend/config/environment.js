const path = require('node:path');

function configuredUrl(name, env) {
  let url;
  try { url = new URL(env[name]); } catch { throw new Error(`Set ${name} to an absolute http(s) URL.`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`Set ${name} to an absolute http(s) URL without credentials, query, or fragment.`);
  }
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error(`${name} must use HTTPS in production.`);
  return url;
}

function emailConfig(env = process.env) {
  const backend = configuredUrl('BACKEND_URL', env);
  const frontend = configuredUrl('FRONTEND_URL', env);
  if (!['file', 'resend'].includes(env.EMAIL_MODE)) throw new Error('Set EMAIL_MODE to file for local development or resend for delivery.');
  if (env.EMAIL_MODE === 'file') {
    const loopback = (url) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (env.NODE_ENV === 'production' || !loopback(backend) || !loopback(frontend)) {
      throw new Error('EMAIL_MODE=file is allowed only for local development with loopback BACKEND_URL and FRONTEND_URL.');
    }
  } else if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !/^[^<>\r\n]*<?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(env.EMAIL_FROM)) {
    throw new Error('EMAIL_MODE=resend requires RESEND_API_KEY and a valid EMAIL_FROM sender.');
  }
  const outboxDir = env.EMAIL_OUTBOX_DIR ? path.resolve(__dirname, '..', env.EMAIL_OUTBOX_DIR) : path.resolve(__dirname, '../../.tmp/email-outbox');
  const relativeToPublic = path.relative(path.resolve(__dirname, '../../Frontend'), outboxDir);
  if (env.EMAIL_MODE === 'file' && (relativeToPublic === '' || (!relativeToPublic.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeToPublic)))) {
    throw new Error('EMAIL_OUTBOX_DIR must be outside the public Frontend directory.');
  }
  return {
    mode: env.EMAIL_MODE,
    backendUrl: backend.href.replace(/\/$/, ''),
    frontendUrl: frontend.href.replace(/\/$/, ''),
    outboxDir,
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM
  };
}

function validateEnvironment(env = process.env) {
  const missing = ['MONGODB_URI', 'JWT_SECRET'].filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  return emailConfig(env);
}

module.exports = { emailConfig, validateEnvironment };
