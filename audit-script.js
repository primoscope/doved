#!/usr/bin/env node

/**
 * EchoTune AI - Comprehensive System Audit Script
 * Tests MongoDB, LLM providers, Spotify API, and data integration
 */

const path = require('path');
const fs = require('fs');

// Change to project directory first
const projectDir = '/home/runner/work/Spotify-echo/Spotify-echo';
process.chdir(projectDir);

// Add project to module path
require('module').globalPaths.push(path.join(projectDir, 'node_modules'));

// Load environment variables
require('dotenv').config();

async function auditMongoDB() {
  console.log('\n📊 MONGODB CONNECTION AUDIT');
  console.log('================================');
  
  try {
    const mongoManager = require('./src/database/mongodb');
    
    // Test basic connection
    console.log('Testing MongoDB connection...');
    try {
      await mongoManager.connect();
      console.log('✅ MongoDB connection successful');
      
      // Test database operations
      const db = mongoManager.getDatabase();
      const collections = await db.listCollections().toArray();
      console.log(`✅ Found ${collections.length} collections:`, collections.map(c => c.name));
      
      // Check for listening history data
      const listeningHistory = db.collection('listening_history');
      const count = await listeningHistory.countDocuments();
      console.log(`✅ Listening history collection has ${count} documents`);
      
      await mongoManager.disconnect();
      return { success: true, collections: collections.length, documents: count };
    } catch (error) {
      console.log('❌ MongoDB connection failed:', error.message);
      return { success: false, error: error.message };
    }
  } catch (error) {
    console.log('❌ MongoDB module import failed:', error.message);
    return { success: false, error: 'Module import failed' };
  }
}

async function auditLLMProviders() {
  console.log('\n🤖 LLM PROVIDERS AUDIT');
  console.log('======================');
  
  try {
    const MockProvider = require('./src/chat/llm-providers/mock-provider');
    const GeminiProvider = require('./src/chat/llm-providers/gemini-provider');
    const OpenAIProvider = require('./src/chat/llm-providers/openai-provider');
    
    const results = {};
    
    // Test Mock Provider
    try {
      const mockProvider = new MockProvider();
      const mockResponse = await mockProvider.generateResponse('Test message about rock music');
      console.log('✅ Mock Provider working:', mockResponse.substring(0, 100) + '...');
      results.mock = { success: true };
    } catch (error) {
      console.log('❌ Mock Provider failed:', error.message);
      results.mock = { success: false, error: error.message };
    }
    
    // Test Gemini Provider (if configured)
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
      try {
        const geminiProvider = new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY });
        const geminiResponse = await geminiProvider.generateResponse('Recommend one song');
        console.log('✅ Gemini Provider working:', geminiResponse.substring(0, 100) + '...');
        results.gemini = { success: true };
      } catch (error) {
        console.log('❌ Gemini Provider failed:', error.message);
        results.gemini = { success: false, error: error.message };
      }
    } else {
      console.log('⚠️ Gemini Provider not configured (no API key)');
      results.gemini = { success: false, error: 'Not configured' };
    }
    
    // Test OpenAI Provider (if configured)
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
      try {
        const openaiProvider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
        const openaiResponse = await openaiProvider.generateResponse('Recommend one song');
        console.log('✅ OpenAI Provider working:', openaiResponse.substring(0, 100) + '...');
        results.openai = { success: true };
      } catch (error) {
        console.log('❌ OpenAI Provider failed:', error.message);
        results.openai = { success: false, error: error.message };
      }
    } else {
      console.log('⚠️ OpenAI Provider not configured (no API key)');
      results.openai = { success: false, error: 'Not configured' };
    }
    
    return results;
  } catch (error) {
    console.log('❌ LLM Provider module import failed:', error.message);
    return { error: 'Module import failed' };
  }
}

async function auditChatbot() {
  console.log('\n💬 CHATBOT INTEGRATION AUDIT');
  console.log('=============================');
  
  try {
    const EchoTuneChatbot = require('./src/chat/chatbot');
    
    // Initialize with mock configuration
    const config = {
      llmProviders: {
        mock: { enabled: true }
      }
    };
    
    const chatbot = new EchoTuneChatbot(config);
    
    // Test basic chat functionality
    const response = await chatbot.chat('I like rock music, recommend something similar', 'test-session');
    console.log('✅ Chatbot working:', response.text.substring(0, 100) + '...');
    
    return { success: true, response: response.text.length };
  } catch (error) {
    console.log('❌ Chatbot failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function auditSpotifyData() {
  console.log('\n🎵 SPOTIFY DATA AUDIT');
  console.log('=====================');
  
  try {
    const csvPath = './data/spotify_listening_history_combined.csv';
    const stats = fs.statSync(csvPath);
    console.log(`✅ Found Spotify CSV: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Read first few lines to verify structure
    const fs_promises = require('fs').promises;
    const data = await fs_promises.readFile(csvPath, 'utf8');
    const lines = data.split('\n').slice(0, 5);
    const headers = lines[0].split(',');
    
    console.log(`✅ CSV has ${headers.length} columns`);
    console.log('✅ Key columns found:', 
      headers.filter(h => h.includes('track') || h.includes('artist') || h.includes('album')).slice(0, 5));
    
    return { 
      success: true, 
      fileSize: stats.size, 
      columns: headers.length,
      sampleLines: lines.length - 1
    };
  } catch (error) {
    console.log('❌ Spotify data audit failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function auditMCPServers() {
  console.log('\n🔧 MCP SERVERS AUDIT');
  console.log('====================');
  
  try {
    // Check if MCP server files exist
    const mcpDir = './mcp-server';
    const mcpFiles = fs.readdirSync(mcpDir);
    console.log(`✅ Found ${mcpFiles.length} MCP server files:`, mcpFiles.slice(0, 5));
    
    // Check package.json MCP configuration
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    const mcpServers = packageJson.mcp?.servers || {};
    console.log(`✅ Configured MCP servers:`, Object.keys(mcpServers));
    
    return { 
      success: true, 
      files: mcpFiles.length,
      configured: Object.keys(mcpServers).length
    };
  } catch (error) {
    console.log('❌ MCP servers audit failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🎵 EchoTune AI - Comprehensive System Audit');
  console.log('===========================================');
  console.log(`🕒 Started at: ${new Date().toISOString()}`);
  
  const results = {
    timestamp: new Date().toISOString(),
    mongodb: await auditMongoDB(),
    llmProviders: await auditLLMProviders(),
    chatbot: await auditChatbot(),
    spotifyData: await auditSpotifyData(),
    mcpServers: await auditMCPServers()
  };
  
  console.log('\n📋 AUDIT SUMMARY');
  console.log('================');
  console.log('MongoDB:', results.mongodb.success ? '✅ Working' : '❌ Failed');
  console.log('LLM Providers:', Object.values(results.llmProviders).some(p => p.success) ? '✅ At least one working' : '❌ All failed');
  console.log('Chatbot:', results.chatbot.success ? '✅ Working' : '❌ Failed');
  console.log('Spotify Data:', results.spotifyData.success ? '✅ Available' : '❌ Missing');
  console.log('MCP Servers:', results.mcpServers.success ? '✅ Configured' : '❌ Not configured');
  
  // Save detailed results
  fs.writeFileSync('/tmp/audit-results.json', JSON.stringify(results, null, 2));
  console.log('\n📄 Detailed results saved to /tmp/audit-results.json');
  
  return results;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };