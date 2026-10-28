const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailIsValid(value) {
  return typeof value === 'string' && value.trim().length <= 254 && EMAIL_PATTERN.test(value.trim());
}

function accountInputError(body, registration = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { field: 'email', message: 'Enter your account details.' };
  if (registration && (typeof body.username !== 'string' || body.username.trim().length < 2 || body.username.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(body.username))) {
    return { field: 'username', message: 'Username must contain between 2 and 80 characters.' };
  }
  if (!emailIsValid(body.email)) return { field: 'email', message: 'Enter a valid email address.' };
  if (typeof body.password !== 'string' || body.password.length < (registration ? 8 : 1) || Buffer.byteLength(body.password, 'utf8') > 72) {
    return { field: 'password', message: registration ? 'Password must have at least 8 characters and no more than 72 UTF-8 bytes.' : 'Enter a valid password.' };
  }
  return null;
}

module.exports = { accountInputError, emailIsValid };
