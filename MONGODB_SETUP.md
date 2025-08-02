# MongoDB Connection Setup - EchoTune AI

This document describes the MongoDB Atlas connection setup for the EchoTune AI project using the provided credentials.

## Connection Details

- **MongoDB URI**: `mongodb+srv://copilot:DapperMan77@cluster0.ofnyuy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`
- **Username**: `copilot`
- **Password**: `DapperMan77`
- **Database**: `spotify_analytics`
- **Collection**: `listening_history`
- **MongoDB Version**: 8.0.12

## Setup Status

✅ **Connection Tested**: Successfully connected to MongoDB Atlas cluster  
✅ **Database Created**: `spotify_analytics` database is operational  
✅ **Collection Ready**: `listening_history` collection with optimized indexes  
✅ **Sample Migration**: Tested with 1,000 sample records  
✅ **Schema Validated**: Document structure confirmed and working  
✅ **Indexes Created**: 20 performance-optimized indexes in place  

## Quick Start

### 1. Test Connection
```bash
python scripts/test_mongodb_connection.py
```

### 2. Migrate Sample Data
```bash
# Small test (100 records)
head -101 data/spotify_listening_history_combined.csv > /tmp/test_sample.csv
python scripts/migrate_to_mongodb.py --input /tmp/test_sample.csv --batch-size 50

# Larger test (1000 records) 
head -1001 data/spotify_listening_history_combined.csv > /tmp/test_large.csv
python scripts/migrate_to_mongodb.py --input /tmp/test_large.csv --batch-size 100 --update
```

### 3. Full Production Migration
```bash
python scripts/migrate_to_mongodb.py --input data/spotify_listening_history_combined.csv --batch-size 1000
```

## Database Schema

The MongoDB collection uses the following document structure:

```json
{
  "_id": "spotify:track:3EtK9JHFyqEUA9sSucw5Si_willexmen_2010-05-03 09:14:32+00:00",
  "spotify_track_uri": "spotify:track:3EtK9JHFyqEUA9sSucw5Si",
  "timestamp": "2010-05-03 09:14:32",
  "user": {
    "username": "willexmen",
    "platform": "Windows XP (Pro Ed) SP2 [x86 0]",
    "country": "SE",
    "ip_address": "62.88.128.149"
  },
  "track": {
    "name": "The Quiet Place",
    "artist": "In Flames",
    "album": "Soundtrack To Your Escape",
    "duration_ms": 210000,
    "popularity": 75
  },
  "listening": {
    "ms_played": 83863,
    "skipped": true,
    "reason_start": "clickrow",
    "reason_end": "clickrow",
    "shuffle": false,
    "offline": false,
    "completion_rate": 0.399
  },
  "audio_features": {
    "danceability": 0.7,
    "energy": 0.8,
    "valence": 0.6,
    "tempo": 120.0
  },
  "metadata": {
    "explicit": true,
    "created_at": "2025-07-31T20:22:16.370000"
  },
  "migration": {
    "created_at": "2025-07-31T20:22:16.370000",
    "source": "csv_import",
    "version": "1.0"
  }
}
```

## Performance Indexes

The following indexes have been created for optimal query performance:

### Primary Indexes
- `spotify_track_uri_1` - Track identification
- `timestamp_-1` - Time-based queries (descending)
- `user.username_1` - User-based queries

### Compound Indexes
- `user.username_1_timestamp_-1` - User listening history
- `user.username_1_spotify_track_uri_1` - User-track combinations
- `track.artist_1_timestamp_-1` - Artist listening timeline
- `album.name_1_track.artist_1` - Album-artist combinations

### Audio Feature Indexes (for ML)
- `audio_features.danceability_1`
- `audio_features.energy_1`
- `audio_features.valence_1`
- `audio_features.tempo_1`
- `audio_features.danceability_1_energy_1_valence_1` - Composite ML index

### Listening Behavior Indexes
- `listening.completion_rate_-1` - Track completion analysis
- `listening.skipped_1_timestamp_-1` - Skip behavior analysis

### Search Index
- `track.name_text_track.artist_text_album.name_text_artist.name_text` - Full-text search

## Current Database Statistics

Based on the test migration:

- **Total Documents**: 997
- **Unique Users**: 1
- **Unique Tracks**: 455
- **Storage Size**: 0.2 MB
- **Index Size**: 1.2 MB
- **Average Document Size**: 668 bytes
- **Date Range**: 2010-05-03 to 2010-09-03

## Environment Configuration

The `.env` file contains:

```env
# MongoDB Atlas Configuration
MONGODB_URI=mongodb+srv://copilot:DapperMan77@cluster0.ofnyuy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
MONGODB_DATABASE=spotify_analytics
MONGODB_COLLECTION=listening_history

# Application Settings
ENVIRONMENT=development
LOG_LEVEL=INFO
DEBUG=true
```

## Migration Scripts

### `scripts/test_mongodb_connection.py`
Comprehensive connection testing script that:
- Tests basic connectivity
- Performs CRUD operations
- Creates sample schema
- Generates database statistics

### `scripts/migrate_to_mongodb.py` 
Production-ready migration script with:
- Batch processing (configurable batch size)
- Error handling and retry logic
- Progress tracking with tqdm
- Upsert capabilities
- Automatic index creation
- Comprehensive logging

### `scripts/mongodb_setup_demo.py`
Interactive demonstration script showing the complete setup process.

## Production Migration

For the full dataset (~80MB, ~208,934 records):

```bash
python scripts/migrate_to_mongodb.py \
  --input data/spotify_listening_history_combined.csv \
  --batch-size 1000 \
  --verbose
```

**Estimated Time**: 5-10 minutes  
**Memory Usage**: ~2GB peak during processing  
**Network**: Minimal (documents are batched)  

## Monitoring and Maintenance

### Check Collection Status
```python
from pymongo import MongoClient
client = MongoClient(os.getenv('MONGODB_URI'))
db = client['spotify_analytics']
collection = db['listening_history']

# Get document count
count = collection.count_documents({})
print(f"Total documents: {count:,}")

# Get collection stats
stats = db.command("collStats", "listening_history")
print(f"Storage size: {stats['storageSize'] / (1024*1024):.2f} MB")
```

### Query Examples
```python
# Find user's top tracks
pipeline = [
    {"$match": {"user.username": "willexmen"}},
    {"$group": {
        "_id": "$spotify_track_uri",
        "play_count": {"$sum": 1},
        "total_ms": {"$sum": "$listening.ms_played"},
        "track_info": {"$first": "$track"}
    }},
    {"$sort": {"play_count": -1}},
    {"$limit": 10}
]
results = collection.aggregate(pipeline)

# Find tracks by audio features
query = {
    "audio_features.energy": {"$gte": 0.8},
    "audio_features.danceability": {"$gte": 0.7}
}
high_energy_tracks = collection.find(query).limit(10)
```

## Troubleshooting

### Connection Issues
1. Check network connectivity to MongoDB Atlas
2. Verify credentials in `.env` file
3. Ensure IP address is whitelisted (currently set to 0.0.0.0/0)

### Migration Issues
1. Check CSV file format and encoding
2. Verify sufficient disk space
3. Monitor memory usage during large migrations
4. Use `--batch-size` parameter to optimize performance

### Performance Issues
1. Ensure proper indexes are created
2. Use aggregation pipelines for complex queries
3. Consider read preferences for analytics workloads

## Security Notes

- Credentials are configured for development/testing
- IP whitelist is currently open (0.0.0.0/0)
- Consider restricting access for production use
- Monitor Atlas usage and billing
- Regular backup verification recommended

## Next Steps

1. **Full Data Migration**: Migrate complete dataset when ready
2. **Query Optimization**: Tune indexes based on actual query patterns  
3. **Monitoring Setup**: Configure Atlas monitoring and alerts
4. **Backup Strategy**: Implement automated backup procedures
5. **Access Control**: Set up proper user roles and permissions