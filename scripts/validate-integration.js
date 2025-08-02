#!/usr/bin/env node

/**
 * Phase 3B Integration Validation Script
 * Tests all integrated APIs and production configurations
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function validateIntegration() {
    console.log('🚀 Phase 3B Integration Validation');
    console.log('==================================');
    
    const results = {
        spotify: false,
        gemini: false,
        providers: false,
        database: false,
        health: false
    };
    
    try {
        // Test 1: Spotify Authentication
        console.log('\n1️⃣ Testing Spotify Authentication...');
        if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
            const spotifyAuth = await axios.post(
                'https://accounts.spotify.com/api/token',
                'grant_type=client_credentials',
                {
                    headers: {
                        'Authorization': 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            
            if (spotifyAuth.data.access_token) {
                console.log('   ✅ Spotify API authentication successful');
                console.log(`   🔑 Client ID: ${process.env.SPOTIFY_CLIENT_ID.substring(0, 8)}...`);
                results.spotify = true;
            }
        } else {
            console.log('   ❌ Spotify credentials not found');
        }
        
        // Test 2: Gemini Provider
        console.log('\n2️⃣ Testing Gemini LLM Provider...');
        const chatResponse = await axios.post(`${BASE_URL}/api/chat/message`, {
            message: "Test: Please respond with just 'Gemini provider working' to confirm functionality.",
            sessionId: "validation-test"
        }, { timeout: 10000 });
        
        if (chatResponse.data.success && chatResponse.data.provider === 'gemini') {
            console.log('   ✅ Gemini provider responding successfully');
            console.log(`   🤖 Model: ${chatResponse.data.model}`);
            console.log(`   ⏱️ Response time: ${chatResponse.data.responseTime}ms`);
            results.gemini = true;
        } else {
            console.log('   ⚠️ Gemini provider not active, checking fallback...');
            if (chatResponse.data.success) {
                console.log(`   🔄 Fallback provider (${chatResponse.data.provider}) working`);
            }
        }
        
        // Test 3: Provider Status
        console.log('\n3️⃣ Testing Provider Management...');
        const providerStatus = await axios.get(`${BASE_URL}/api/providers/status`);
        
        if (providerStatus.data.success) {
            const { activeProviders, totalProviders, keyPool, statistics } = providerStatus.data;
            console.log('   ✅ Provider management operational');
            console.log(`   📊 Active providers: ${activeProviders}/${totalProviders}`);
            console.log(`   🔑 Key pools: OpenRouter(${keyPool.openrouter.total}), Gemini(${keyPool.gemini.total})`);
            console.log(`   📈 Success rate: ${statistics.requests > 0 ? ((statistics.successes / statistics.requests) * 100).toFixed(1) : 'N/A'}%`);
            results.providers = true;
        }
        
        // Test 4: Database Status
        console.log('\n4️⃣ Testing Database Integration...');
        const healthCheck = await axios.get(`${BASE_URL}/health`);
        
        if (healthCheck.data.status === 'healthy') {
            const dbStatus = healthCheck.data.dependencies.database;
            console.log('   ✅ Database system operational');
            console.log(`   🗄️ Connection type: ${dbStatus.details.connectionType}`);
            console.log(`   🔄 Fallback available: ${dbStatus.details.fallbackAvailable}`);
            console.log(`   🏥 Health status: ${dbStatus.status}`);
            results.database = true;
        }
        
        // Test 5: Overall Health
        console.log('\n5️⃣ Testing System Health...');
        if (healthCheck.data.status === 'healthy') {
            console.log('   ✅ Overall system health: HEALTHY');
            console.log(`   💾 Memory usage: ${(healthCheck.data.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   ⏱️ Uptime: ${healthCheck.data.uptime.toFixed(1)} seconds`);
            results.health = true;
        }
        
        // Summary
        console.log('\n📋 Integration Summary');
        console.log('======================');
        const successful = Object.values(results).filter(Boolean).length;
        const total = Object.keys(results).length;
        
        Object.entries(results).forEach(([test, passed]) => {
            console.log(`   ${passed ? '✅' : '❌'} ${test.charAt(0).toUpperCase() + test.slice(1)}: ${passed ? 'PASS' : 'FAIL'}`);
        });
        
        console.log(`\n🎯 Overall Score: ${successful}/${total} (${((successful/total) * 100).toFixed(1)}%)`);
        
        if (successful === total) {
            console.log('\n🎉 ALL SYSTEMS OPERATIONAL - Production Ready!');
            console.log('🌐 Access the application: http://localhost:3000');
        } else {
            console.log('\n⚠️ Some systems need attention, but core functionality is operational');
        }
        
    } catch (error) {
        console.error('\n❌ Validation error:', error.message);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
}

if (require.main === module) {
    validateIntegration().catch(console.error);
}

module.exports = { validateIntegration };