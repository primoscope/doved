# EchoTune AI Database Architecture Guide

## 📊 Dataset Analysis

### Current Data Profile
- **Size**: 77MB CSV file
- **Records**: 208,934 listening records
- **Columns**: 57 features
- **Time Span**: 14 years (2010-2024)
- **Unique Tracks**: ~41,918
- **Unique Artists**: ~9,821
- **Listening Hours**: ~6,949 hours

### Data Structure Overview
```
Core Listening Data:
├── Identifiers: spotify_track_uri, track_id, user_agent
├── Timestamps: ts_x, ts_y, Added At
├── Listening Metrics: ms_played_x, ms_played_y, skipped
├── Platform Data: platform, conn_country, ip_addr
├── Track Metadata: track_name, artist_name, album_name
├── Audio Features: danceability, energy, valence, tempo, etc.
└── Spotify Metadata: popularity, explicit, ISRC, genres
```

## 🏗️ Database Platform Comparison

### 1. MongoDB (Recommended for ML/Analytics)

**Strengths:**
- Excellent for JSON-like documents with varying schemas
- Native aggregation pipeline for complex analytics
- Horizontal scaling with sharding
- Strong indexing capabilities for time-series data
- Atlas cloud service with auto-scaling

**Use Cases:**
- ML feature engineering and model training
- Real-time analytics and dashboards
- Recommendation engine data processing
- User behavior pattern analysis

**Estimated Storage:**
- Raw Data: ~150MB (BSON overhead)
- With Indexes: ~300MB
- With Audio Features: ~400MB

### 2. Supabase (PostgreSQL) (Recommended for Applications)

**Strengths:**
- ACID compliance for transactional integrity
- Advanced SQL capabilities with window functions
- Real-time subscriptions and triggers
- Built-in authentication and row-level security
- Excellent for relational data models

**Use Cases:**
- User management and playlists
- Transactional operations
- Real-time features and notifications
- API-driven applications

**Estimated Storage:**
- Normalized Tables: ~200MB
- With Indexes: ~350MB
- With Audio Features: ~450MB

### 3. Digital Ocean Managed Databases

**Strengths:**
- Cost-effective for large datasets
- Multiple engine options (PostgreSQL, MySQL, MongoDB, Redis)
- Automated backups and scaling
- VPC networking for security
- Performance monitoring tools

**Use Cases:**
- Production deployments
- High-traffic applications
- Multi-region deployments
- Cost-sensitive projects

## 🎯 Recommended Architecture

### Hybrid Multi-Database Approach

```
┌─────────────────────────────────────────────────────────┐
│                   Data Flow Architecture                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Raw CSV Data                                          │
│       │                                                │
│       ▼                                                │
│  ┌─────────────┐      ┌──────────────────────────────┐ │
│  │   MongoDB   │◄────►│      Spotify API             │ │
│  │   (Atlas)   │      │   Audio Features Service     │ │
│  │             │      └──────────────────────────────┘ │
│  │ - Analytics │                                       │
│  │ - ML Training│      ┌──────────────────────────────┐ │
│  │ - Aggregation│      │         Supabase             │ │
│  │             │◄────►│       (PostgreSQL)           │ │
│  └─────────────┘      │                              │ │
│                       │ - User Management            │ │
│                       │ - Playlists                  │ │
│                       │ - Real-time Features         │ │
│                       │ - API Layer                  │ │
│                       └──────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Primary Database: MongoDB Atlas
- **Purpose**: Analytics, ML training, data processing
- **Data Model**: Document-based with embedded audio features
- **Scaling**: Auto-scaling clusters
- **Backup**: Point-in-time recovery

### Secondary Database: Supabase
- **Purpose**: Application layer, user management, real-time features
- **Data Model**: Normalized relational tables
- **Features**: Authentication, real-time subscriptions, edge functions
- **API**: Auto-generated REST and GraphQL APIs

## 🚀 Setup Instructions

### MongoDB Atlas Setup

#### 1. Create MongoDB Atlas Account
```bash
# Install MongoDB tools
npm install -g mongodb-database-tools
brew install mongosh  # macOS
sudo apt install mongodb-mongosh  # Ubuntu
```

#### 2. Create Cluster
1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Create new project: "EchoTune-AI"
3. Build cluster:
   - Provider: AWS
   - Region: US East (N. Virginia) or nearest
   - Tier: M10 (2GB RAM, 10GB storage) for development
   - Cluster Name: "spotify-analytics"

#### 3. Configure Security
```bash
# Database user
Username: echontune-admin
Password: [Generate strong password]
Privileges: Atlas admin

# Network Access
IP Whitelist: 0.0.0.0/0 (for development)
# Production: Specific IPs only
```

#### 4. Environment Configuration
```bash
# Add to .env
MONGODB_URI=mongodb+srv://echotune-admin:<password>@spotify-analytics.xxxxx.mongodb.net/
MONGODB_DATABASE=spotify_analytics
MONGODB_COLLECTION=listening_history
```

### Supabase Setup

#### 1. Create Supabase Project
1. Go to [Supabase](https://supabase.com)
2. Create new project: "echotune-ai"
3. Region: East US (us-east-1)
4. Database Password: [Generate strong password]

#### 2. Configure Environment
```bash
# Add to .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:[password]@db.your-project.supabase.co:5432/postgres
```

#### 3. Create Tables
```sql
-- Users table
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    spotify_user_id TEXT UNIQUE,
    email TEXT UNIQUE,
    username TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Playlists table
CREATE TABLE playlists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    spotify_playlist_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User preferences table
CREATE TABLE user_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    preferred_genres TEXT[],
    audio_feature_weights JSONB,
    recommendation_settings JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
```

### Digital Ocean Setup (Optional for Production)

#### 1. Create DO Account and Database
```bash
# Install doctl CLI
brew install doctl  # macOS
# or download from https://github.com/digitalocean/doctl

# Authenticate
doctl auth init

# Create database cluster
doctl databases create spotify-prod-db \
  --engine postgresql \
  --region nyc1 \
  --size db-s-1vcpu-1gb \
  --num-nodes 1
```

#### 2. Configure Database
```bash
# Get connection details
doctl databases connection spotify-prod-db

# Create database and user
doctl databases db create spotify-prod-db echotune_production
doctl databases user create spotify-prod-db echotune_api
```

## 📈 Performance Optimization

### MongoDB Indexing Strategy

```javascript
// Create indexes for optimal query performance
db.listening_history.createIndex({ "spotify_track_uri": 1 })
db.listening_history.createIndex({ "ts_x": 1 })
db.listening_history.createIndex({ "master_metadata_album_artist_name_x": 1 })
db.listening_history.createIndex({ "username": 1, "ts_x": -1 })

// Compound indexes for common queries
db.listening_history.createIndex({ 
  "username": 1, 
  "ts_x": -1, 
  "spotify_track_uri": 1 
})

// Text index for search functionality
db.listening_history.createIndex({
  "master_metadata_track_name_x": "text",
  "master_metadata_album_artist_name_x": "text",
  "master_metadata_album_album_name_x": "text"
})

// Audio features index for ML queries
db.listening_history.createIndex({
  "Danceability": 1,
  "Energy": 1,
  "Valence": 1,
  "Tempo": 1
})
```

### PostgreSQL Indexing Strategy

```sql
-- Primary indexes
CREATE INDEX idx_users_spotify_id ON users(spotify_user_id);
CREATE INDEX idx_playlists_user_id ON playlists(user_id);
CREATE INDEX idx_playlists_created_at ON playlists(created_at DESC);

-- Composite indexes
CREATE INDEX idx_user_prefs_user_genres ON user_preferences(user_id, preferred_genres);

-- GIN indexes for JSON columns
CREATE INDEX idx_user_prefs_audio_weights ON user_preferences USING GIN(audio_feature_weights);
CREATE INDEX idx_user_prefs_rec_settings ON user_preferences USING GIN(recommendation_settings);
```

## 🔄 Data Migration Scripts

### CSV to MongoDB Migration

```python
#!/usr/bin/env python3
"""
MongoDB Migration Script for EchoTune AI
Migrates CSV data to MongoDB Atlas with optimized schema
"""

import pandas as pd
import pymongo
from pymongo import MongoClient, InsertOne
import os
from datetime import datetime
import logging

def migrate_to_mongodb():
    # Configuration
    MONGODB_URI = os.getenv('MONGODB_URI')
    DATABASE_NAME = os.getenv('MONGODB_DATABASE', 'spotify_analytics')
    COLLECTION_NAME = os.getenv('MONGODB_COLLECTION', 'listening_history')
    
    # Connect to MongoDB
    client = MongoClient(MONGODB_URI)
    db = client[DATABASE_NAME]
    collection = db[COLLECTION_NAME]
    
    # Load CSV data
    df = pd.read_csv('data/spotify_listening_history_combined.csv')
    
    # Data transformation
    documents = []
    for _, row in df.iterrows():
        doc = {
            'spotify_track_uri': row['spotify_track_uri'],
            'timestamp': pd.to_datetime(row['ts_x']),
            'user': {
                'username': row['username'],
                'platform': row['platform'],
                'country': row['conn_country']
            },
            'track': {
                'name': row['master_metadata_track_name_x'],
                'artist': row['master_metadata_album_artist_name_x'],
                'album': row['master_metadata_album_album_name_x'],
                'duration_ms': row.get('Track Duration (ms)_releases'),
                'popularity': row.get('Popularity_releases')
            },
            'listening': {
                'ms_played': row['ms_played_x'],
                'skipped': row.get('skipped', False),
                'reason_start': row.get('reason_start'),
                'reason_end': row.get('reason_end'),
                'shuffle': row.get('shuffle', False),
                'offline': row.get('offline', False)
            },
            'audio_features': {
                'danceability': row.get('Danceability'),
                'energy': row.get('Energy'),
                'key': row.get('Key'),
                'loudness': row.get('Loudness'),
                'mode': row.get('Mode'),
                'speechiness': row.get('Speechiness'),
                'acousticness': row.get('Acousticness'),
                'instrumentalness': row.get('Instrumentalness'),
                'liveness': row.get('Liveness'),
                'valence': row.get('Valence'),
                'tempo': row.get('Tempo'),
                'time_signature': row.get('Time Signature')
            },
            'metadata': {
                'genres': row.get('Artist Genres', '').split(',') if row.get('Artist Genres') else [],
                'explicit': row.get('Explicit_releases', False),
                'isrc': row.get('ISRC_releases'),
                'label': row.get('Label')
            },
            'created_at': datetime.utcnow()
        }
        
        # Remove null audio features
        doc['audio_features'] = {k: v for k, v in doc['audio_features'].items() if pd.notna(v)}
        
        documents.append(InsertOne(doc))
    
    # Batch insert
    if documents:
        result = collection.bulk_write(documents)
        print(f"Inserted {result.inserted_count} documents")
    
    # Create indexes
    collection.create_index([("spotify_track_uri", 1)])
    collection.create_index([("timestamp", -1)])
    collection.create_index([("user.username", 1), ("timestamp", -1)])
    
    client.close()

if __name__ == "__main__":
    migrate_to_mongodb()
```

### CSV to Supabase Migration

```python
#!/usr/bin/env python3
"""
Supabase Migration Script for EchoTune AI
Migrates user and playlist data to PostgreSQL
"""

import pandas as pd
import psycopg2
from supabase import create_client, Client
import os
import uuid

def migrate_to_supabase():
    # Configuration
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    # Initialize Supabase client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Load CSV data
    df = pd.read_csv('data/spotify_listening_history_combined.csv')
    
    # Extract unique users
    unique_users = df['username'].unique()
    
    # Insert users
    users_data = []
    for username in unique_users:
        user_data = {
            'id': str(uuid.uuid4()),
            'spotify_user_id': username,
            'username': username
        }
        users_data.append(user_data)
    
    # Batch insert users
    result = supabase.table('users').insert(users_data).execute()
    print(f"Inserted {len(result.data)} users")

if __name__ == "__main__":
    migrate_to_supabase()
```

## 🔧 Audio Features Enhancement

The dataset currently has audio feature columns but they're mostly empty. We need to populate them using the Spotify Web API.

### Missing Audio Features Strategy

1. **Extract unique track URIs** from the dataset
2. **Batch fetch audio features** from Spotify API (max 100 tracks per request)
3. **Update existing records** with audio feature data
4. **Handle rate limiting** and API quotas
5. **Cache results** to avoid redundant API calls

### Performance Recommendations

#### MongoDB Optimizations
- Use compound indexes for common query patterns
- Enable sharding for datasets >1GB
- Use aggregation pipelines for analytics
- Implement data archiving for old records

#### Supabase Optimizations
- Use prepared statements for repeated queries
- Implement connection pooling
- Use JSONB columns for flexible metadata
- Enable read replicas for analytics

#### General Optimizations
- Implement caching layer (Redis) for frequently accessed data
- Use CDN for static assets and API responses
- Implement data partitioning by date ranges
- Use background jobs for heavy processing

## 💰 Cost Estimation

### MongoDB Atlas (M10 Development)
- **Compute**: $57/month (2GB RAM, 10GB storage)
- **Data Transfer**: ~$0.10/GB
- **Backups**: Included
- **Monthly Estimate**: ~$60-70

### Supabase (Pro Plan)
- **Database**: $25/month (8GB, 100GB bandwidth)
- **Storage**: $0.021/GB/month
- **Bandwidth**: $0.09/GB
- **Monthly Estimate**: ~$30-40

### Digital Ocean (Basic Droplet + Managed DB)
- **Database**: $30/month (db-s-1vcpu-1gb)
- **Compute**: $24/month (s-2vcpu-4gb)
- **Bandwidth**: 4TB included
- **Monthly Estimate**: ~$55-65

### Recommended Development Setup
- **MongoDB Atlas M0 (Free)**: $0/month (512MB RAM, 5GB storage)
- **Supabase Free**: $0/month (500MB database, 1GB bandwidth)
- **Total Development Cost**: $0/month

### Production Scaling Path
1. **Phase 1 (MVP)**: Free tiers ($0/month)
2. **Phase 2 (Beta)**: MongoDB M10 + Supabase Pro ($90-110/month)
3. **Phase 3 (Production)**: Multi-region deployment ($200-300/month)

## 🛠️ Development Workflow

### Quick Setup Commands

```bash
# Interactive database setup wizard
python scripts/database_setup.py --interactive

# Populate audio features (mock mode for testing)
python scripts/populate_audio_features.py --mock --input data/spotify_listening_history_combined.csv

# Migrate to MongoDB
python scripts/migrate_to_mongodb.py --input data/spotify_listening_history_combined.csv

# Migrate to Supabase
python scripts/migrate_to_supabase.py --input data/spotify_listening_history_combined.csv

# Test database connections
python scripts/database_setup.py --test
```

### Development Phases

1. **Local Development**: Use free tier databases
2. **Staging**: Use development tier configurations
3. **Production**: Use optimized production configurations with monitoring
4. **Analytics**: Separate read-replica or data warehouse for heavy analytics

This architecture provides scalability, performance, and cost-effectiveness for the EchoTune AI platform while supporting both real-time application features and machine learning workflows.