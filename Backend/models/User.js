const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
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
