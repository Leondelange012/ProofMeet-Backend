# ProofMeet Backend

This is the backend API for the ProofMeet court-ordered meeting attendance tracking system.

## Deployment

This repository contains only the backend server for easy deployment to Railway.

## API Endpoints

- `GET /health` - Health check
- `POST /api/auth/register` - Register user
- `POST /api/auth/verify` - Verify user (court system)
- `POST /api/auth/login` - User login

## Test Users

The system comes with pre-loaded test users:
- `participant1@example.com` (Participant)
- `host1@example.com` (Host)

## Environment Variables

- `NODE_ENV=production`
- `JWT_SECRET=your-secret-here`
- `CORS_ORIGIN=*` (or your frontend URL)
