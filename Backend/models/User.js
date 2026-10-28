const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
    validate: { validator: require('../utils/accountValidation').emailIsValid, message: 'Enter a valid email address.' }
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ["buyer", "seller", "admin"],
    default: "buyer"
  },
  storeName: {
    type: String,
    trim: true,
    default: ""
  },
  storeLocation: {
    type: String,
    trim: true,
    default: ""
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    select: false
  },
  verificationExpires: {
    type: Date
  },
  verificationRequestedAt: {
    type: Date,
    select: false
  }
});

UserSchema.pre("save", async function() {
  if (this.role === "admin") {
    const existingAdmin = await mongoose.model("User").findOne({ role: "admin" });
    
    if (existingAdmin && existingAdmin._id.toString() !== this._id.toString()) {
      throw new Error("Access denied: Only one admin user is allowed in the system.");
    }
  }
});

module.exports = mongoose.model("User", UserSchema);
