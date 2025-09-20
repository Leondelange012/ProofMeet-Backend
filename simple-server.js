const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Mock data
const users = new Map();
const tokens = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Register user
app.post('/api/auth/register', (req, res) => {
  const { email, courtId, state, courtCaseNumber } = req.body;
  
  if (users.has(email)) {
    return res.status(400).json({
      success: false,
      error: 'User already exists'
    });
  }
  
  const user = {
    id: `user-${Date.now()}`,
    email,
    courtId,
    state,
    courtCaseNumber,
    isVerified: false,
    isHost: email.includes('host')
  };
  
  users.set(email, user);
  
  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      userId: user.id,
      email: user.email,
      courtId: user.courtId,
      state: user.state
    }
  });
});

// Verify user
app.post('/api/auth/verify', (req, res) => {
  const { email, verified } = req.body;
  
  const user = users.get(email);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }
  
  user.isVerified = verified;
  users.set(email, user);
  
  res.json({
    success: true,
    message: `User ${verified ? 'verified' : 'unverified'} successfully`
  });
});

// Login user
app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  
  const user = users.get(email);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }
  
  if (!user.isVerified) {
    return res.status(401).json({
      success: false,
      error: 'Account not verified by court system'
    });
  }
  
  const token = `token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  tokens.set(token, user);
  
  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        courtId: user.courtId,
        state: user.state,
        isHost: user.isHost,
        isVerified: user.isVerified
      }
    }
  });
});

// Create some test users
const testUsers = [
  {
    email: 'participant1@example.com',
    courtId: 'CA-12345',
    state: 'CA',
    courtCaseNumber: 'CASE-2024-001',
    isHost: false
  },
  {
    email: 'host1@example.com',
    courtId: 'CA-HOST-001',
    state: 'CA',
    courtCaseNumber: 'HOST-2024-001',
    isHost: true
  }
];

testUsers.forEach(userData => {
  const user = {
    id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...userData,
    isVerified: true
  };
  users.set(user.email, user);
});

console.log('✅ Test users created:');
testUsers.forEach(user => {
  console.log(`   - ${user.email} (${user.isHost ? 'Host' : 'Participant'})`);
});

app.listen(PORT, () => {
  console.log(`🚀 ProofMeet Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Ready for login at frontend: http://localhost:3000`);
});
