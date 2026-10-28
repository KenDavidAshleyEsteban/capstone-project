const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { emailConfig } = require('../config/environment');

module.exports = async function sendEmail(options) {
  const config = emailConfig();
  if (config.mode === 'file') {
    await fs.mkdir(config.outboxDir, { recursive: true, mode: 0o700 });
    const file = path.join(config.outboxDir, `${Date.now()}-${randomUUID()}.json`);
    await fs.writeFile(file, JSON.stringify({ to: options.email, subject: options.subject, html: options.html, createdAt: new Date().toISOString() }, null, 2), { flag: 'wx', mode: 0o600 });
    return { id: path.basename(file), mode: 'file' };
  }
  const { Resend } = require('resend');
  const result = await new Resend(config.apiKey).emails.send({ from: config.from, to: options.email, subject: options.subject, html: options.html });
  if (result.error || !result.data?.id) {
    const error = new Error('The verification email provider did not accept the message.');
    error.code = 'EMAIL_DELIVERY_FAILED';
    throw error;
  }
  return result.data;
};
