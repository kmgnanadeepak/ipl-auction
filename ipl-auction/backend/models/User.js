const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['admin', 'participant'],
    default: 'participant'
  },
  teamName: {
    type: String,
    trim: true,
    default: ''
  },
  teamLogo: {
    type: String,
    default: ''
  },
  budget: {
    type: Number,
    default: 10000 // In Lakhs (100 Cr = 10000 Lakhs)
  },
  remainingBudget: {
    type: Number,
    default: 10000
  },
  squad: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  color: {
    type: String,
    default: '#FF6B00' // Team color for UI
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual for squad count
userSchema.virtual('squadCount').get(function() {
  return this.squad.length;
});

module.exports = mongoose.model('User', userSchema);
