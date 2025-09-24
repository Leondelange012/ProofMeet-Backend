const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://proof-meet-frontend.vercel.app',
    'https://proof-meet-frontend-ixfekv3a7-leon-de-langes-projects.vercel.app'
  ],
  credentials: true
}));
app.use(express.json());

// Zoom webhook verification (GET request)
app.get('/api/webhooks/zoom', (req, res) => {
  const challenge = req.query.challenge;
  
  console.log('📞 GET request to webhook endpoint');
  console.log('Query params:', req.query);
  console.log('Headers:', req.headers);
  
  if (challenge) {
    console.log('📞 Zoom webhook verification request received with challenge:', challenge);
    res.status(200).json({
      challenge: challenge
    });
  } else {
    console.log('📞 GET request without challenge - returning basic response');
    res.status(200).json({ 
      status: 'Webhook endpoint is active',
      timestamp: new Date().toISOString()
    });
  }
});

// Zoom webhook events handler (POST request)
app.post('/api/webhooks/zoom', (req, res) => {
  try {
    const event = req.body;
    
    console.log('📅 POST request to webhook endpoint');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(event, null, 2));
    console.log('Event type:', event.event);
    
    // Handle different event types
    switch (event.event) {
      case 'endpoint.url_validation':
        console.log('✅ Zoom endpoint validation successful');
        // For validation events, Zoom expects us to echo back the plainToken
        const plainToken = event.payload?.plainToken;
        if (plainToken) {
          console.log('📤 Responding with plainToken:', plainToken);
          // Try different response formats that Zoom might expect
          res.set('Content-Type', 'application/json');
          return res.status(200).send(plainToken); // Some apps expect just the token as string
        }
        break;
        
      case 'meeting.started':
        console.log('🟢 Meeting started:', event.payload?.object?.id);
        break;
        
      case 'meeting.ended':
        console.log('🔴 Meeting ended:', event.payload?.object?.id);
        break;
        
      case 'meeting.participant_joined':
        const joinedParticipant = event.payload?.object?.participant;
        console.log('👋 Participant joined:', joinedParticipant?.user_name, joinedParticipant?.email);
        break;
        
      case 'meeting.participant_left':
        const leftParticipant = event.payload?.object?.participant;
        console.log('👋 Participant left:', leftParticipant?.user_name, leftParticipant?.email);
        break;
        
      default:
        console.log('⚠️ Unhandled event type:', event.event);
    }
    
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('❌ Error processing Zoom webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      database: 'Connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      database: 'Disconnected',
      error: error.message
    });
  }
});

// Register user
app.post('/api/auth/register', async (req, res) => {
  const { email, courtId, state, courtCaseNumber } = req.body;
  
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists'
      });
    }
    
    const user = await prisma.user.create({
      data: {
        email,
        courtId,
        state,
        courtCaseNumber,
        isVerified: false,
        isHost: email.includes('host')
      }
    });
    
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
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// Verify user
app.post('/api/auth/verify', async (req, res) => {
  const { email, verified } = req.body;
  
  try {
    const user = await prisma.user.update({
      where: { email },
      data: { isVerified: verified }
    });
    
    res.json({
      success: true,
      message: `User ${verified ? 'verified' : 'unverified'} successfully`
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  const { email } = req.body;
  
  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

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
    
    // Create auth token
    const token = `token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

    await prisma.authToken.create({
      data: {
        token,
        expiresAt,
        userId: user.id
      }
    });
    
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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Initialize test users
async function initializeTestUsers() {
  try {
    const testUsers = [
      {
        email: 'participant1@example.com',
        courtId: 'CA-12345',
        state: 'CA',
        courtCaseNumber: 'CASE-2024-001',
        isHost: false,
        isVerified: true
      },
      {
        email: 'host1@example.com',
        courtId: 'CA-HOST-001',
        state: 'CA',
        courtCaseNumber: 'HOST-2024-001',
        isHost: true,
        isVerified: true
      }
    ];

    for (const userData of testUsers) {
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email }
      });

      if (!existingUser) {
        await prisma.user.create({
          data: userData
        });
        console.log(`✅ Created test user: ${userData.email}`);
      }
    }
  } catch (error) {
    console.error('Error initializing test users:', error);
  }
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, async () => {
  console.log(`🚀 ProofMeet Backend with Database running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Ready for login at frontend`);
  
  // Initialize test users
  await initializeTestUsers();
});
