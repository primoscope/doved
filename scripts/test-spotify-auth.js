#!/usr/bin/env node

/**
 * Test script to verify Spotify OAuth setup
 * Run with: node scripts/test-spotify-auth.js
 */

const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

async function testSpotifyAuth() {
    console.log('🔍 Testing Spotify Authentication Setup');
    console.log('=====================================');
    
    // Check if credentials are set
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        console.log('❌ Spotify credentials not found in environment variables');
        console.log('   Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET');
        process.exit(1);
    }
    
    console.log('✅ Spotify credentials found');
    console.log(`   Client ID: ${SPOTIFY_CLIENT_ID.substring(0, 8)}...`);
    
    // Test client credentials flow (doesn't require user auth)
    try {
        const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        if (response.data.access_token) {
            console.log('✅ Spotify API authentication successful');
            console.log(`   Token expires in: ${response.data.expires_in} seconds`);
            
            // Test API call
            const apiResponse = await axios.get(
                'https://api.spotify.com/v1/browse/categories?limit=5',
                {
                    headers: {
                        'Authorization': `Bearer ${response.data.access_token}`
                    }
                }
            );
            
            console.log('✅ Spotify API call successful');
            console.log(`   Retrieved ${apiResponse.data.categories.items.length} music categories`);
            
        } else {
            console.log('❌ No access token received');
        }
        
    } catch (error) {
        console.log('❌ Spotify API authentication failed');
        if (error.response) {
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.log(`   Error: ${error.message}`);
        }
        process.exit(1);
    }
    
    console.log('');
    console.log('🎯 OAuth URL that will be used:');
    
    // Environment-aware redirect URI fallback
    const getDefaultRedirectUri = () => {
        if (process.env.NODE_ENV === 'production') {
            return 'https://primosphere.studio/auth/callback';
        }
        return 'http://localhost:3000/auth/callback';
    };
    
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI || getDefaultRedirectUri();
    const authURL = `https://accounts.spotify.com/authorize?response_type=code&client_id=${SPOTIFY_CLIENT_ID}&scope=user-read-private%20user-read-email%20playlist-modify-public%20playlist-modify-private&redirect_uri=${encodeURIComponent(redirectUri)}`;
    console.log(`   ${authURL}`);
    
    console.log('');
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Redirect URI: ${redirectUri}`);
    console.log('');
    console.log('✅ All tests passed! Your Spotify integration is ready.');
}

if (require.main === module) {
    testSpotifyAuth().catch(console.error);
}

module.exports = { testSpotifyAuth };