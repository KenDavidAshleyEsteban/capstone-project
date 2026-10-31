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

  if (config.mode === 'brevo') {
    try {
      const fromMatch = config.from.match(/^(?:"?([^"]*)"?\s)?(?:<)?([^>]+)(?:>)?$/);
      const senderName = fromMatch && fromMatch[1] ? fromMatch[1].trim() : 'Gunpla Hub';
      const senderEmail = fromMatch && fromMatch[2] ? fromMatch[2].trim() : 'noreply@gunplahub.live';

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': config.brevoKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: options.email }],
          subject: options.subject,
          htmlContent: options.html
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Brevo API error response:', data);
        const error = new Error(data.message || 'The verification email provider did not accept the message.');
        error.code = 'EMAIL_DELIVERY_FAILED';
        throw error;
      }

      return { id: data.messageId || 'brevo-sent', mode: 'brevo' };
    } catch (err) {
      console.error('Brevo API request failed:', err.message || err);
      const error = new Error('The verification email provider did not accept the message.');
      error.code = 'EMAIL_DELIVERY_FAILED';
      throw error;
    }
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