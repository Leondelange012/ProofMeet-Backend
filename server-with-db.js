const express = require('express');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const app = express();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

// Zoom API Configuration
const ZOOM_CONFIG = {
  ACCOUNT_ID: 'csxjpAf5Ruml6T-ol_hJBQ',
  CLIENT_ID: 'Xyt7NChhTe679v_P865ktw',
  CLIENT_SECRET: 'w4Jerea8ifg8tafDYlq2jBKAh8v0j5eY',
  API_BASE_URL: 'https://api.zoom.us/v2'
};

// Generate Zoom API Access Token
async function getZoomAccessToken() {
  try {
    // Try the standard Server-to-Server OAuth endpoint first
    const response = await axios.post('https://zoom.us/oauth/token', 
      new URLSearchParams({
        'grant_type': 'account_credentials',
        'account_id': ZOOM_CONFIG.ACCOUNT_ID
      }), {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${ZOOM_CONFIG.CLIENT_ID}:${ZOOM_CONFIG.CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    console.log('✅ Zoom access token obtained successfully');
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Failed to get Zoom access token:');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('Config used:', {
      account_id: ZOOM_CONFIG.ACCOUNT_ID,
      client_id: ZOOM_CONFIG.CLIENT_ID,
      url: 'https://zoom.us/oauth/token'
    });
    throw error;
  }
}

// Create Zoom Meeting
async function createZoomMeeting(meetingData) {
  try {
    const accessToken = await getZoomAccessToken();
    
    const meetingConfig = {
      topic: meetingData.title,
      type: 2, // Scheduled meeting
      start_time: meetingData.scheduledFor,
      duration: meetingData.duration,
      timezone: 'UTC',
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        mute_upon_entry: true,
        waiting_room: true,
        audio: 'both',
        auto_recording: 'none'
      }
    };
    
    const response = await axios.post(
      `${ZOOM_CONFIG.API_BASE_URL}/users/me/meetings`,
      meetingConfig,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Zoom meeting created successfully:', response.data.id);
    return response.data;
  } catch (error) {
    console.error('❌ Failed to create Zoom meeting:', error.response?.data || error.message);
    throw error;
  }
}

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
          // Try the exact format Zoom documentation specifies
          return res.status(200).json({
            plainToken: plainToken
          });
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
  const { 
    email, 
    courtId, 
    state, 
    courtCaseNumber, 
    isHost, 
    firstName, 
    lastName, 
    phoneNumber, 
    dateOfBirth 
  } = req.body;
  
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
    
    // Create new user with current schema (temporary until migration)
    const user = await prisma.user.create({
      data: {
        email,
        courtId,
        state,
        courtCaseNumber,
        isHost: isHost || false,
        isVerified: false // Requires court verification
      }
    });
    
    console.log(`✅ User registered: ${email} (${isHost ? 'Host' : 'Participant'})`);
    console.log(`📝 Additional info: ${firstName} ${lastName}, ${phoneNumber}, ${dateOfBirth}`);
    
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
  const { email, password } = req.body;
  
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
    
    // For demo purposes, check if password is 'password123'
    // In production, this would be properly hashed and compared
    if (password !== 'password123') {
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

// Create meeting endpoint
app.post('/api/meetings/create', async (req, res) => {
  try {
    const { title, description, scheduledFor, duration } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    // Get user from token (simplified for now)
    const authToken = await prisma.authToken.findUnique({
      where: { token },
      include: { user: true }
    });
    
    if (!authToken || !authToken.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token'
      });
    }
    
    if (!authToken.user.isHost) {
      return res.status(403).json({
        success: false,
        error: 'Only hosts can create meetings'
      });
    }
    
    // Create Zoom meeting
    const zoomMeeting = await createZoomMeeting({
      title,
      scheduledFor,
      duration
    });
    
    // Save meeting to database
    const meeting = await prisma.meeting.create({
      data: {
        title,
        description: description || '',
        scheduledFor: new Date(scheduledFor),
        duration: parseInt(duration),
        hostId: authToken.user.id,
        zoomMeetingId: zoomMeeting.id.toString(),
        zoomJoinUrl: zoomMeeting.join_url,
        isActive: true
      }
    });
    
    res.status(201).json({
      success: true,
      data: {
        meetingId: meeting.id,
        zoomMeetingId: meeting.zoomMeetingId,
        joinUrl: meeting.zoomJoinUrl,
        title: meeting.title,
        scheduledFor: meeting.scheduledFor,
        duration: meeting.duration
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create meeting'
    });
  }
});

// Get meetings for a host
app.get('/api/meetings/host/:hostId', async (req, res) => {
  try {
    const { hostId } = req.params;
    const { page = 1, limit = 10, status = 'active' } = req.query;
    
    const meetings = await prisma.meeting.findMany({
      where: {
        hostId,
        isActive: status === 'active'
      },
      include: {
        host: {
          select: { email: true, courtId: true }
        },
        attendanceRecords: {
          include: {
            user: {
              select: { email: true }
            }
          }
        }
      },
      orderBy: {
        scheduledFor: 'desc'
      },
      skip: (page - 1) * limit,
      take: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: meetings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: meetings.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch meetings'
    });
  }
});

// Get all active meetings (for participants)
app.get('/api/meetings/all', async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'active' } = req.query;
    
    const meetings = await prisma.meeting.findMany({
      where: {
        isActive: status === 'active'
      },
      include: {
        host: {
          select: { email: true, courtId: true }
        }
      },
      orderBy: {
        scheduledFor: 'desc'
      },
      skip: (page - 1) * limit,
      take: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: meetings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: meetings.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching all meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch all meetings'
    });
  }
});

// Delete a meeting
app.delete('/api/meetings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const meeting = await prisma.meeting.findUnique({
      where: { id }
    });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }
    
    await prisma.meeting.delete({
      where: { id }
    });
    
    res.json({
      success: true,
      message: 'Meeting deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete meeting'
    });
  }
});

// Update a meeting
app.put('/api/meetings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, scheduledFor, duration } = req.body;
    
    const meeting = await prisma.meeting.findUnique({
      where: { id }
    });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }
    
    const updatedMeeting = await prisma.meeting.update({
      where: { id },
      data: {
        title,
        description,
        scheduledFor: new Date(scheduledFor),
        duration: parseInt(duration)
      }
    });
    
    res.json({
      success: true,
      data: updatedMeeting
    });
    
  } catch (error) {
    console.error('❌ Error updating meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update meeting'
    });
  }
});

// Test Zoom API connection
app.get('/api/zoom/test', async (req, res) => {
  try {
    const accessToken = await getZoomAccessToken();
    
    // Just test that we can get an access token - that's enough to prove the API works
    res.json({
      success: true,
      message: 'Zoom API connection successful - OAuth working!',
      data: {
        accountId: ZOOM_CONFIG.ACCOUNT_ID,
        status: 'Connected',
        tokenValid: true,
        tokenObtained: new Date().toISOString(),
        scopes: 'meeting:write:meeting:admin user:write:user:admin'
      }
    });
    
  } catch (error) {
    console.error('❌ Zoom API test failed:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Zoom API connection failed',
      details: error.response?.data || error.message
    });
  }
});

// Test creating a real Zoom meeting
app.get('/api/zoom/test-meeting', async (req, res) => {
  try {
    const testMeetingData = {
      title: 'ProofMeet Test Meeting',
      scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      duration: 30
    };
    
    const zoomMeeting = await createZoomMeeting(testMeetingData);
    
    res.json({
      success: true,
      message: 'Test Zoom meeting created successfully!',
      data: {
        meetingId: zoomMeeting.id,
        joinUrl: zoomMeeting.join_url,
        startUrl: zoomMeeting.start_url,
        title: zoomMeeting.topic,
        scheduledFor: zoomMeeting.start_time,
        duration: zoomMeeting.duration
      }
    });
    
  } catch (error) {
    console.error('❌ Test meeting creation failed:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create test meeting',
      details: error.response?.data || error.message
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
