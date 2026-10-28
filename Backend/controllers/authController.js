const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const { accountInputError, emailIsValid } = require("../utils/accountValidation");
const { emailConfig } = require("../config/environment");

const ALLOWED_ROLES = ["buyer", "seller", "admin"];
const VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_COOLDOWN_MS = 60 * 1000;

function verificationDetails() {
 const token = crypto.randomBytes(32).toString('hex');
 return { token, fields: {
   verificationToken: crypto.createHash('sha256').update(token).digest('hex'),
   verificationExpires: new Date(Date.now() + VERIFICATION_LIFETIME_MS),
   verificationRequestedAt: new Date()
 } };
}

async function deliverVerification(user, details, res) {
 try {
   const verificationUrl = `${emailConfig().backendUrl}/api/auth/verify?token=${details.token}`;
   await sendEmail({
     email: user.email,
     subject: 'Verify Your Email Address',
     html: `<h2>Welcome to Gunpla Hub!</h2><p>Verify your email address before signing in. This link expires in 24 hours.</p><a href="${verificationUrl}">Verify Email</a>`
   });
   return true;
 } catch (error) {
   await User.updateOne({ _id: user._id, verificationToken: details.fields.verificationToken, isVerified: false }, {
     $unset: { verificationToken: 1, verificationExpires: 1, verificationRequestedAt: 1 }
   });
   console.error('Verification email delivery failed:', error.code || 'EMAIL_DELIVERY_FAILED');
   res.status(503).json({ code: 'VERIFICATION_EMAIL_FAILED', verificationRequired: true, email: user.email, retryAfterSeconds: 0,
     message: 'Your account is saved, but the verification email could not be delivered. Use resend verification to try again.' });
   return false;
 }
}

function sanitizeRole(role) {
 const normalized = String(role || "buyer").trim().toLowerCase();
 return ALLOWED_ROLES.includes(normalized) ? normalized : null;
}

function publicUser(user) {
 return {
   id: user._id,
   username: user.username,
   email: user.email,
   role: user.role,
   storeName: user.storeName || "",
   storeLocation: user.storeLocation || ""
 };
}

function createToken(user) {
 return jwt.sign(
   {id:user._id, role:user.role},
   process.env.JWT_SECRET,
   {expiresIn:"1d"}
 );
}

exports.register = async (req, res) => {
 try {
   const inputError = accountInputError(req.body, true);
   if (inputError) return res.status(400).json(inputError);
   const {username, email, password, role, storeName, storeLocation} = req.body;
   const accountRole = sanitizeRole(role);
   const normalizedStoreName = String(storeName || "").trim();
   const normalizedStoreLocation = String(storeLocation || "").trim();

   if(!username || !email || !password) {
     return res.status(400).json({message:"Username, email, and password are required"});
   }

   if(!accountRole) {
     return res.status(400).json({message:"Role must be buyer, seller, or admin"});
   }

   if(accountRole === "admin") {
     return res.status(403).json({message:"Administrator accounts must be created using the explicit admin setup command."});
   }

   if(accountRole === "seller" && (!normalizedStoreName || !normalizedStoreLocation)) {
     return res.status(400).json({message:"Store name and location are required for seller accounts"});
   }

   const normalizedEmail = String(email).trim().toLowerCase();
   const existingUser = await User.findOne({email: normalizedEmail});

   if(existingUser) {
     if (!existingUser.isVerified) return res.status(409).json({ code: 'VERIFICATION_REQUIRED', verificationRequired: true, email: existingUser.email,
       message: 'This account is waiting for email verification. Use resend verification to receive a new link.' });
     return res.status(409).json({message:"Email is already registered"});
   }

   const hashed = await bcrypt.hash(password, 10);

   const details = verificationDetails();

   const user = await User.create({
     username: username.trim(),
     email: normalizedEmail,
     password: hashed,
     role: accountRole,
     storeName: accountRole === "seller" ? normalizedStoreName : "",
     storeLocation: accountRole === "seller" ? normalizedStoreLocation : "",
     isVerified: false,
     ...details.fields
   });

   if (!(await deliverVerification(user, details, res))) return;

   res.status(201).json({
     verificationRequired: true,
     email: user.email,
     message: "Registration successful! Please check your email to verify your account before logging in."
   });
 } catch (error) {
   if (error.code === 11000) return res.status(409).json({ message: 'Email is already registered. If verification is pending, use resend verification.' });
   console.error("Registration failed:", error.name);
   res.status(500).json({message:"Registration failed. Please try again."});
 }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({ message: "Invalid verification token" });
    }

    const user = await User.findOneAndUpdate({
      isVerified: false,
      verificationToken: crypto.createHash('sha256').update(token).digest('hex'),
      verificationExpires: { $gt: new Date() }
    }, { $set: { isVerified: true }, $unset: { verificationToken: 1, verificationExpires: 1, verificationRequestedAt: 1 } }, { returnDocument: 'after' });

    if (!user) {
      return res.status(400).json({ message: "Verification token is invalid or has expired." });
    }

    res.redirect(`${emailConfig().frontendUrl}/login.html?verified=true`);
  } catch (error) {
    console.error("VERIFICATION ERROR:", error);
    res.status(500).json({ message: "Verification failed. Please try again." });
  }
};

exports.resendVerification = async (req, res) => {
 try {
   if (!emailIsValid(req.body?.email)) return res.status(400).json({ field: 'email', message: 'Enter a valid email address.' });
   const email = req.body.email.trim().toLowerCase();
   const details = verificationDetails();
   const user = await User.findOneAndUpdate({ email, isVerified: false, $or: [
     { verificationRequestedAt: { $exists: false } },
     { verificationRequestedAt: { $lte: new Date(Date.now() - VERIFICATION_COOLDOWN_MS) } }
   ] }, { $set: details.fields }, { returnDocument: 'after' });
   if (user) {
     if (!(await deliverVerification(user, details, res))) return;
   } else {
     const pending = await User.findOne({ email, isVerified: false }).select('+verificationRequestedAt');
     if (pending?.verificationRequestedAt) {
       const retryAfterSeconds = Math.max(1, Math.ceil((pending.verificationRequestedAt.getTime() + VERIFICATION_COOLDOWN_MS - Date.now()) / 1000));
       return res.set('Retry-After', String(retryAfterSeconds)).status(429).json({ code: 'VERIFICATION_COOLDOWN', retryAfterSeconds, message: 'Please wait before requesting another verification email.' });
     }
   }
   res.json({ verificationRequired: true, email, message: 'If this account needs verification, a new verification link has been sent.' });
 } catch (error) {
   console.error('Verification resend failed:', error.name);
   res.status(500).json({ message: 'Unable to resend verification. Please try again.' });
 }
};

exports.login = async (req, res) => {
  try {
    const inputError = accountInputError(req.body);
    if (inputError) return res.status(400).json(inputError);
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid email or password" });

    if (!user.isVerified) {
      return res.status(403).json({ code: 'VERIFICATION_REQUIRED', verificationRequired: true, email: user.email, message: "Please verify your email address before logging in." });
    }

    const token = createToken(user);

    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ message: "Login failed. Please try again." });
  }
};
