const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");

const ALLOWED_ROLES = ["buyer", "seller", "admin"];

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

exports.register = async(res,res)=>{
 try {
   const {username,email,password,role,storeName,storeLocation,adminSecret} = req.body;
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
     if(!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
       return res.status(403).json({message:"Unauthorized to register as admin"});
     }
   }

   if(accountRole === "seller" && (!normalizedStoreName || !normalizedStoreLocation)) {
     return res.status(400).json({message:"Store name and location are required for seller accounts"});
   }

   const normalizedEmail = String(email).trim().toLowerCase();
   const existingUser = await User.findOne({email: normalizedEmail});

   if(existingUser) {
     return res.status(409).json({message:"Email is already registered"});
   }

   const hashed = await bcrypt.hash(password,10);

   const verificationToken = crypto.randomBytes(32).toString("hex");
   const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

   const user = await User.create({
     username,
     email: normalizedEmail,
     password: hashed,
     role: accountRole,
     storeName: accountRole === "seller" ? normalizedStoreName : "",
     storeLocation: accountRole === "seller" ? normalizedStoreLocation : "",
     isVerified: false,
     verificationToken,
     verificationExpires
   });

   const verificationUrl = `${process.env.BACKEND_URL || 'https://capstone-project-35cd.onrender.com'}/api/auth/verify?token=${verificationToken}`;

   await sendEmail({
     email: user.email,
     subject: "Verify Your Email Address",
     html: `
       <h2>Welcome to our platform, ${username}!</h2>
       <p>Please click the link below to verify your email address. This link will expire in 24 hours.</p>
       <a href="${verificationUrl}" target="_blank" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
     `
   });

   res.status(201).json({
     message: "Registration successful! Please check your email to verify your account before logging in."
   });
 } catch (error) {
   console.error("REGISTRATION ERROR:", error);
   res.status(500).json({message:"Registration failed", error:error.message});
 }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ message: "Invalid verification token" });
    }

    const user = await User.findOne({
      verificationToken: token,
      verificationExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: "Verification token is invalid or has expired." });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    await user.save();

    res.redirect('https://gunpla-hub-mu.vercel.app/login.html?verified=true');
  } catch (error) {
    console.error("VERIFICATION ERROR:", error);
    res.status(500).json({ message: "Verification failed", error: error.message });
  }
};

exports.login = async(req,res)=>{
 try {
   const {email, password} = req.body;

   if(!email || !password) {
     return res.status(400).json({message:"Email and password are required"});
   }

   const user = await User.findOne({email:String(email).trim().toLowerCase()}).select("+password");
   if(!user) return res.status(400).json({message:"Invalid email or password"});

   if(!user.isVerified && user.role !== "admin") {
     return res.status(403).json({message:"Please verify your email address before logging in."});
   }

   const match = await bcrypt.compare(password, user.password);
   if(!match) return res.status(400).json({message:"Invalid email or password"});

   const token = createToken(user);

   res.json({token, user:publicUser(user)});
 } catch (error) {
   res.status(500).json({message:"Login failed", error:error.message});
 }
};