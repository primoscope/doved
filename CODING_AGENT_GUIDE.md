# 🤖 GitHub Coding Agent Guide for EchoTune AI

## Project Overview
EchoTune AI is a sophisticated music recommendation system that processes Spotify listening history data to provide personalized music recommendations through a conversational AI interface.

## 🎯 Agent Objectives
This guide helps GitHub coding agents understand the project structure, automate development workflows, and implement features according to the project vision.

## 📁 Project Structure
```
Spotify-echo/
├── .github/workflows/          # GitHub Actions for CI/CD automation
├── databases/                  # CSV data files (to be merged)
├── src/                       # Source code (to be created)
│   ├── api/                   # Spotify API integration
│   ├── ml/                    # Machine learning models
│   ├── chat/                  # Conversational AI interface
│   └── database/              # Database management
├── tests/                     # Automated test suites
├── scripts/                   # Utility scripts
├── docs/                      # Documentation
├── mcp-server/                # MCP server configuration
├── requirements.txt           # Python dependencies
├── package.json               # Node.js dependencies
└── .env                       # Environment configuration
```

## 🔧 Development Automation Patterns

### 1. Code Generation Templates
Use these patterns when creating new components:

#### Spotify API Service Template
```python
# src/api/spotify_service.py
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from typing import List, Dict, Any

class SpotifyService:
    def __init__(self, client_id: str, client_secret: str, redirect_uri: str):
        self.sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            scope="user-read-listening-history playlist-modify-public"
        ))
    
    async def get_user_tracks(self) -> List[Dict[str, Any]]:
        """Fetch user's recent tracks"""
        pass
    
    async def create_playlist(self, tracks: List[str]) -> str:
        """Create playlist with given track IDs"""
        pass
```

#### ML Model Template
```python
# src/ml/recommendation_model.py
import pandas as pd
import numpy as np
from sklearn.base import BaseEstimator
from typing import List, Tuple

class RecommendationModel(BaseEstimator):
    def __init__(self, features: List[str]):
        self.features = features
        self.model = None
    
    def fit(self, X: pd.DataFrame, y: pd.Series):
        """Train the model on user listening data"""
        pass
    
    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Generate recommendations"""
        pass
```

### 2. Testing Automation
Always create tests when implementing new features:

```python
# tests/test_spotify_service.py
import pytest
from unittest.mock import Mock, patch
from src.api.spotify_service import SpotifyService

@pytest.fixture
def spotify_service():
    return SpotifyService("test_id", "test_secret", "http://localhost:3000")

async def test_get_user_tracks(spotify_service):
    """Test fetching user tracks"""
    pass

async def test_create_playlist(spotify_service):
    """Test playlist creation"""
    pass
```

### 3. Database Optimization
The project contains split CSV files that need to be merged and optimized:

```python
# scripts/merge_csv_data.py
import pandas as pd
import glob
from pathlib import Path

def merge_csv_files():
    """Merge all split CSV files into optimized single file"""
    csv_files = glob.glob("databases/split_data_part_*.csv")
    combined_df = pd.concat([pd.read_csv(f) for f in csv_files], ignore_index=True)
    
    # Remove duplicates and optimize
    combined_df = combined_df.drop_duplicates()
    combined_df = combined_df.sort_values('ts_x')
    
    # Save optimized file
    combined_df.to_csv("databases/spotify_listening_history.csv", index=False)
    return len(combined_df)
```

## 🌐 MCP Server Integration

### Browser Automation Configuration
```json
{
  "name": "spotify-browser-automation",
  "version": "1.0.0",
  "servers": {
    "browser": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-puppeteer"],
      "env": {
        "PUPPETEER_HEADLESS": "true"
      }
    },
    "spotify": {
      "command": "python",
      "args": ["mcp-server/spotify_server.py"],
      "env": {
        "SPOTIFY_CLIENT_ID": "${SPOTIFY_CLIENT_ID}",
        "SPOTIFY_CLIENT_SECRET": "${SPOTIFY_CLIENT_SECRET}"
      }
    }
  }
}
```

### Spotify MCP Server
```python
# mcp-server/spotify_server.py
import asyncio
from mcp import Server
from mcp.types import Resource, Tool
from src.api.spotify_service import SpotifyService

app = Server("spotify-mcp")

@app.tool("get_recommendations")
async def get_recommendations(user_id: str, limit: int = 20):
    """Get personalized music recommendations"""
    pass

@app.tool("create_playlist")
async def create_playlist(name: str, tracks: list):
    """Create a new Spotify playlist"""
    pass

@app.resource("user-profile")
async def user_profile(user_id: str):
    """Get user's music profile and preferences"""
    pass
```

## 🔄 CI/CD Automation Workflows

### Key Automation Points:
1. **Code Quality**: Auto-format with black/prettier, lint with pylint/eslint
2. **Testing**: Run pytest and jest on every commit
3. **Database**: Auto-merge CSV files and validate data integrity
4. **Documentation**: Auto-generate API docs from docstrings
5. **Deployment**: Auto-deploy to staging on main branch

### GitHub Actions Integration:
- Automated dependency updates
- Security vulnerability scanning
- Performance benchmarking
- Cross-platform testing (Linux, macOS, Windows)

## 🎵 Spotify API Workflow Patterns

### Authentication Flow
```python
def setup_spotify_auth():
    """Setup Spotify OAuth for automated workflows"""
    return SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
        scope="user-read-listening-history playlist-modify-public user-read-recently-played"
    )
```

### Data Processing Pipeline
```python
def process_listening_data(df: pd.DataFrame) -> pd.DataFrame:
    """Standardized data processing for Spotify listening history"""
    # Remove invalid entries
    df = df.dropna(subset=['spotify_track_uri', 'ts_x'])
    
    # Convert timestamps
    df['timestamp'] = pd.to_datetime(df['ts_x'])
    
    # Calculate listening score
    df['listening_score'] = df['ms_played_x'] / df['Track Duration (ms)_releases']
    
    # Extract features
    feature_cols = ['Danceability', 'Energy', 'Valence', 'Tempo', 'Acousticness']
    df[feature_cols] = df[feature_cols].fillna(df[feature_cols].mean())
    
    return df
```

## 📋 Development Task Automation

### Priority Task List for Agents:
1. **Merge CSV Data**: Combine all split files into optimized dataset
2. **Setup Database**: Create SQLite/PostgreSQL schema for processed data
3. **Implement Spotify API**: Create service layer for API interactions
4. **Build ML Pipeline**: Develop recommendation algorithm
5. **Create Chat Interface**: Implement conversational AI layer
6. **Add Testing**: Comprehensive test suite with mocking
7. **Deploy MCP Server**: Setup browser automation and API integration

### Code Quality Standards:
- **Python**: Use black, isort, mypy, pylint
- **JavaScript**: Use prettier, eslint, typescript
- **Documentation**: Comprehensive docstrings and type hints
- **Testing**: >90% code coverage, integration tests
- **Security**: Environment variable validation, input sanitization

## 🚨 Common Pitfalls to Avoid:
1. **API Rate Limits**: Implement proper rate limiting for Spotify API
2. **Data Privacy**: Never commit .env files or API keys
3. **Memory Usage**: Process large CSV files in chunks
4. **Error Handling**: Graceful degradation when APIs are unavailable
5. **Cross-Platform**: Ensure compatibility across operating systems

## 📊 Performance Optimization:
- Use async/await for API calls
- Implement caching for frequently accessed data
- Optimize database queries with proper indexing
- Use connection pooling for database access
- Implement lazy loading for large datasets

## 🗄️ Database Architecture & Setup

EchoTune AI supports multiple database platforms optimized for different use cases:

### Database Platform Overview

| Platform | Use Case | Data Type | Strengths |
|----------|----------|-----------|-----------|
| **MongoDB Atlas** | Analytics & ML Training | Document-based | Aggregation pipelines, flexible schema, ML-optimized |
| **Supabase** | Application Layer | Relational | Real-time features, authentication, ACID compliance |
| **Digital Ocean** | Production Deployment | Multi-engine | Cost-effective, managed backups, VPC networking |

### Quick Database Setup

1. **Interactive Setup Wizard**:
   ```bash
   python scripts/database_setup.py --interactive
   ```

2. **Test Existing Connections**:
   ```bash
   python scripts/database_setup.py --test
   ```

3. **Generate Database Commands**:
   ```bash
   python scripts/database_setup.py --commands
   ```

### Data Migration Workflow

1. **Populate Missing Audio Features**:
   ```bash
   # With Spotify API credentials
   python scripts/populate_audio_features.py --input data/spotify_listening_history_combined.csv
   
   # Mock mode for testing
   python scripts/populate_audio_features.py --mock --input data/spotify_listening_history_combined.csv
   ```

2. **Migrate to MongoDB** (for ML/Analytics):
   ```bash
   python scripts/migrate_to_mongodb.py --input data/spotify_listening_history_combined.csv
   ```

3. **Migrate to Supabase** (for Application):
   ```bash
   python scripts/migrate_to_supabase.py --input data/spotify_listening_history_combined.csv
   ```

### Environment Configuration

Create a `.env` file with your database credentials:

```bash
# Spotify API
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret

# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGODB_DATABASE=spotify_analytics
MONGODB_COLLECTION=listening_history

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
```

### Performance Optimizations

- **MongoDB**: Compound indexes, aggregation pipelines, sharding for >1GB datasets
- **Supabase**: Connection pooling, JSONB indexes, read replicas for analytics
- **Caching**: Redis layer for frequently accessed data
- **Data Partitioning**: By date ranges for improved query performance

For detailed setup instructions, see `DATABASE_ARCHITECTURE_GUIDE.md`.

### Cost Estimation

#### Development (Free Tiers)
- MongoDB Atlas M0: Free (512MB RAM, 5GB storage)
- Supabase Free: Free (500MB database, 1GB bandwidth)
- **Total**: $0/month

#### Production
- MongoDB Atlas M10: ~$57/month
- Supabase Pro: ~$25/month  
- Digital Ocean Managed DB: ~$30/month
- **Total**: $55-115/month depending on platform choice

### Database Schema Examples

#### MongoDB Document Structure
```javascript
{
  "_id": "track_user_timestamp",
  "spotify_track_uri": "spotify:track:...",
  "timestamp": ISODate("2024-01-01T12:00:00Z"),
  "user": {
    "username": "user123",
    "platform": "Windows",
    "country": "US"
  },
  "track": {
    "name": "Song Title",
    "artist": "Artist Name",
    "album": "Album Name",
    "duration_ms": 240000
  },
  "audio_features": {
    "danceability": 0.75,
    "energy": 0.85,
    "valence": 0.60
  },
  "listening": {
    "ms_played": 180000,
    "completion_rate": 0.75,
    "skipped": false
  }
}
```

#### Supabase Schema
```sql
-- Core application tables
CREATE TABLE users (
    id UUID PRIMARY KEY,
    spotify_user_id TEXT UNIQUE,
    username TEXT UNIQUE NOT NULL
);

CREATE TABLE tracks (
    id UUID PRIMARY KEY,
    spotify_track_id TEXT UNIQUE,
    name TEXT NOT NULL,
    artist_name TEXT,
    duration_ms INTEGER
);

CREATE TABLE listening_history (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    track_id UUID REFERENCES tracks(id),
    played_at TIMESTAMP WITH TIME ZONE,
    ms_played INTEGER,
    completion_rate REAL
);
```

This guide ensures coding agents can efficiently contribute to the EchoTune AI project while maintaining code quality and following established patterns.