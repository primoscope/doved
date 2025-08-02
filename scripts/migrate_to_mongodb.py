#!/usr/bin/env python3
"""
MongoDB Migration Script for EchoTune AI
Migrates CSV data to MongoDB Atlas with optimized schema and indexing
"""

import pandas as pd
import pymongo
from pymongo import MongoClient, InsertOne, UpdateOne
import os
import sys
from datetime import datetime, timezone
import logging
from typing import List, Dict, Any
import json
from tqdm import tqdm
import argparse
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MongoDBMigrator:
    """Handles migration of CSV data to MongoDB with optimization"""
    
    def __init__(self, mongodb_uri: str = None, database_name: str = None, collection_name: str = None):
        self.mongodb_uri = mongodb_uri or os.getenv('MONGODB_URI')
        self.database_name = database_name or os.getenv('MONGODB_DATABASE', 'spotify_analytics')
        self.collection_name = collection_name or os.getenv('MONGODB_COLLECTION', 'listening_history')
        
        if not self.mongodb_uri:
            raise ValueError("MongoDB URI not provided. Set MONGODB_URI environment variable.")
        
        self.client = None
        self.db = None
        self.collection = None
        
    def connect(self):
        """Connect to MongoDB"""
        try:
            self.client = MongoClient(self.mongodb_uri)
            self.db = self.client[self.database_name]
            self.collection = self.db[self.collection_name]
            
            # Test connection
            self.client.admin.command('ismaster')
            logger.info(f"Connected to MongoDB: {self.database_name}.{self.collection_name}")
            
        except Exception as e:
            logger.error(f"Error connecting to MongoDB: {e}")
            raise
    
    def disconnect(self):
        """Disconnect from MongoDB"""
        if self.client:
            self.client.close()
            logger.info("Disconnected from MongoDB")
    
    def transform_record(self, row: pd.Series) -> Dict[str, Any]:
        """Transform a CSV row into a MongoDB document"""
        # Helper function to clean values
        def clean_value(value):
            if pd.isna(value) or value == '' or value == 'nan':
                return None
            return value
        
        # Helper function to parse timestamp
        def parse_timestamp(ts_str):
            if pd.isna(ts_str):
                return None
            try:
                return pd.to_datetime(ts_str)
            except:
                return None
        
        # Helper function to parse genres
        def parse_genres(genres_str):
            if pd.isna(genres_str) or genres_str == '':
                return []
            return [genre.strip() for genre in str(genres_str).split(',') if genre.strip()]
        
        # Create the document structure
        doc = {
            '_id': f"{clean_value(row.get('spotify_track_uri', ''))}_{clean_value(row.get('username', ''))}_{clean_value(row.get('ts_x', ''))}",
            'spotify_track_uri': clean_value(row.get('spotify_track_uri')),
            'timestamp': parse_timestamp(row.get('ts_x')),
            
            # User information
            'user': {
                'username': clean_value(row.get('username')),
                'platform': clean_value(row.get('platform')),
                'country': clean_value(row.get('conn_country')),
                'ip_address': clean_value(row.get('ip_addr_decrypted')),
                'user_agent': clean_value(row.get('user_agent_decrypted'))
            },
            
            # Track metadata
            'track': {
                'name': clean_value(row.get('master_metadata_track_name_x')),
                'artist': clean_value(row.get('master_metadata_album_artist_name_x')),
                'album': clean_value(row.get('master_metadata_album_album_name_x')),
                'uri': clean_value(row.get('Track URI')),
                'duration_ms': clean_value(row.get('Track Duration (ms)_releases')),
                'track_number': clean_value(row.get('Track Number_releases')),
                'disc_number': clean_value(row.get('Disc Number_releases')),
                'preview_url': clean_value(row.get('Track Preview URL_releases')),
                'popularity': clean_value(row.get('Popularity_releases')),
                'isrc': clean_value(row.get('ISRC_releases'))
            },
            
            # Album information
            'album': {
                'name': clean_value(row.get('Album Name_releases')),
                'uri': clean_value(row.get('Album URI_releases')),
                'artist_name': clean_value(row.get('Album Artist Name(s)_releases')),
                'artist_uri': clean_value(row.get('Album Artist URI(s)_releases')),
                'release_date': clean_value(row.get('Album Release Date_releases')),
                'image_url': clean_value(row.get('Album Image URL_releases')),
                'genres': parse_genres(row.get('Album Genres')),
                'label': clean_value(row.get('Label'))
            },
            
            # Artist information
            'artist': {
                'name': clean_value(row.get('Artist Name(s)_releases')),
                'uri': clean_value(row.get('Artist URI(s)_releases')),
                'genres': parse_genres(row.get('Artist Genres'))
            },
            
            # Listening behavior
            'listening': {
                'ms_played': clean_value(row.get('ms_played_x')),
                'skipped': bool(clean_value(row.get('skipped', False))),
                'reason_start': clean_value(row.get('reason_start')),
                'reason_end': clean_value(row.get('reason_end')),
                'shuffle': bool(clean_value(row.get('shuffle', False))),
                'offline': bool(clean_value(row.get('offline', False))),
                'completion_rate': None  # Will be calculated
            },
            
            # Audio features
            'audio_features': {
                'danceability': clean_value(row.get('Danceability')),
                'energy': clean_value(row.get('Energy')),
                'key': clean_value(row.get('Key')),
                'loudness': clean_value(row.get('Loudness')),
                'mode': clean_value(row.get('Mode')),
                'speechiness': clean_value(row.get('Speechiness')),
                'acousticness': clean_value(row.get('Acousticness')),
                'instrumentalness': clean_value(row.get('Instrumentalness')),
                'liveness': clean_value(row.get('Liveness')),
                'valence': clean_value(row.get('Valence')),
                'tempo': clean_value(row.get('Tempo')),
                'time_signature': clean_value(row.get('Time Signature'))
            },
            
            # Metadata
            'metadata': {
                'explicit': bool(clean_value(row.get('Explicit_releases', False))),
                'added_by': clean_value(row.get('Added By_releases')),
                'added_at': parse_timestamp(row.get('Added At_releases')),
                'copyrights': clean_value(row.get('Copyrights'))
            },
            
            # Migration metadata
            'migration': {
                'created_at': datetime.now(timezone.utc),
                'source': 'csv_import',
                'version': '1.0'
            }
        }
        
        # Calculate completion rate if possible
        if doc['listening']['ms_played'] and doc['track']['duration_ms']:
            try:
                completion_rate = float(doc['listening']['ms_played']) / float(doc['track']['duration_ms'])
                doc['listening']['completion_rate'] = min(completion_rate, 1.0)  # Cap at 100%
            except (ValueError, ZeroDivisionError):
                pass
        
        # Remove empty nested objects
        for key in ['user', 'track', 'album', 'artist', 'listening', 'audio_features', 'metadata']:
            if key in doc:
                # Remove None values from nested objects
                doc[key] = {k: v for k, v in doc[key].items() if v is not None}
                
                # Remove empty nested objects
                if not doc[key]:
                    del doc[key]
        
        return doc
    
    def create_indexes(self):
        """Create optimized indexes for query performance"""
        logger.info("Creating database indexes...")
        
        indexes_to_create = [
            # Primary indexes
            ([("spotify_track_uri", 1)], {"background": True}),
            ([("timestamp", -1)], {"background": True}),
            ([("user.username", 1)], {"background": True}),
            
            # Compound indexes for common queries
            ([("user.username", 1), ("timestamp", -1)], {"background": True}),
            ([("user.username", 1), ("spotify_track_uri", 1)], {"background": True}),
            ([("track.artist", 1), ("timestamp", -1)], {"background": True}),
            ([("album.name", 1), ("track.artist", 1)], {"background": True}),
            
            # Audio features indexes for ML queries
            ([("audio_features.danceability", 1)], {"background": True}),
            ([("audio_features.energy", 1)], {"background": True}),
            ([("audio_features.valence", 1)], {"background": True}),
            ([("audio_features.tempo", 1)], {"background": True}),
            
            # Composite audio features index
            ([
                ("audio_features.danceability", 1),
                ("audio_features.energy", 1),
                ("audio_features.valence", 1)
            ], {"background": True}),
            
            # Listening behavior indexes
            ([("listening.completion_rate", -1)], {"background": True, "sparse": True}),
            ([("listening.skipped", 1), ("timestamp", -1)], {"background": True}),
            
            # Genre and metadata indexes
            ([("artist.genres", 1)], {"background": True}),
            ([("album.genres", 1)], {"background": True}),
            ([("track.popularity", -1)], {"background": True, "sparse": True})
        ]
        
        # Create text index for search functionality
        text_index = [
            ("track.name", "text"),
            ("track.artist", "text"),
            ("album.name", "text"),
            ("artist.name", "text")
        ]
        
        try:
            # Create regular indexes
            for index_spec, options in indexes_to_create:
                try:
                    self.collection.create_index(index_spec, **options)
                    logger.info(f"Created index: {index_spec}")
                except Exception as e:
                    logger.warning(f"Failed to create index {index_spec}: {e}")
            
            # Create text index
            try:
                self.collection.create_index(text_index, background=True)
                logger.info("Created text search index")
            except Exception as e:
                logger.warning(f"Failed to create text index: {e}")
            
            logger.info("Index creation completed")
            
        except Exception as e:
            logger.error(f"Error creating indexes: {e}")
    
    def migrate_csv_data(self, csv_file_path: str, batch_size: int = 1000, 
                        update_mode: bool = False) -> Dict[str, int]:
        """Migrate CSV data to MongoDB"""
        logger.info(f"Starting migration from {csv_file_path}")
        
        # Load CSV data
        try:
            df = pd.read_csv(csv_file_path)
            total_records = len(df)
            logger.info(f"Loaded {total_records} records from CSV")
        except Exception as e:
            logger.error(f"Error loading CSV file: {e}")
            raise
        
        # Migration statistics
        stats = {
            'total_records': total_records,
            'processed': 0,
            'inserted': 0,
            'updated': 0,
            'failed': 0
        }
        
        # Process data in batches
        batch_operations = []
        
        with tqdm(total=total_records, desc="Migrating records") as pbar:
            for index, row in df.iterrows():
                try:
                    # Transform record
                    doc = self.transform_record(row)
                    
                    if update_mode:
                        # Use upsert operation
                        operation = UpdateOne(
                            {'_id': doc['_id']},
                            {'$set': doc},
                            upsert=True
                        )
                    else:
                        # Use insert operation
                        operation = InsertOne(doc)
                    
                    batch_operations.append(operation)
                    stats['processed'] += 1
                    
                    # Execute batch when it reaches batch_size
                    if len(batch_operations) >= batch_size:
                        self._execute_batch(batch_operations, stats, update_mode)
                        batch_operations = []
                    
                    pbar.update(1)
                    
                except Exception as e:
                    logger.warning(f"Error processing record {index}: {e}")
                    stats['failed'] += 1
                    pbar.update(1)
        
        # Execute remaining operations
        if batch_operations:
            self._execute_batch(batch_operations, stats, update_mode)
        
        logger.info("Migration completed")
        return stats
    
    def _execute_batch(self, operations: List, stats: Dict[str, int], update_mode: bool):
        """Execute a batch of operations"""
        try:
            result = self.collection.bulk_write(operations, ordered=False)
            
            if update_mode:
                stats['inserted'] += result.upserted_count
                stats['updated'] += result.modified_count
            else:
                stats['inserted'] += result.inserted_count
                
        except Exception as e:
            logger.error(f"Batch operation failed: {e}")
            stats['failed'] += len(operations)
    
    def generate_migration_report(self, stats: Dict[str, int]):
        """Generate a migration report"""
        print("\n" + "="*60)
        print("MONGODB MIGRATION REPORT")
        print("="*60)
        
        print(f"Total Records: {stats['total_records']:,}")
        print(f"Processed: {stats['processed']:,}")
        print(f"Inserted: {stats['inserted']:,}")
        print(f"Updated: {stats['updated']:,}")
        print(f"Failed: {stats['failed']:,}")
        
        success_rate = ((stats['processed'] - stats['failed']) / stats['total_records']) * 100
        print(f"Success Rate: {success_rate:.1f}%")
        
        # Collection statistics
        try:
            collection_stats = self.db.command("collStats", self.collection_name)
            print(f"\nCollection Statistics:")
            print(f"  Document Count: {collection_stats.get('count', 0):,}")
            print(f"  Storage Size: {collection_stats.get('storageSize', 0) / (1024*1024):.2f} MB")
            print(f"  Index Size: {collection_stats.get('totalIndexSize', 0) / (1024*1024):.2f} MB")
            print(f"  Average Document Size: {collection_stats.get('avgObjSize', 0):.0f} bytes")
        except Exception as e:
            logger.warning(f"Could not retrieve collection statistics: {e}")
        
        print("\n" + "="*60)
        print(f"Data migrated to: {self.database_name}.{self.collection_name}")
        print("="*60)
    
    def run_migration(self, csv_file_path: str, batch_size: int = 1000, 
                     update_mode: bool = False, create_indexes: bool = True):
        """Run the complete migration process"""
        try:
            # Connect to MongoDB
            self.connect()
            
            # Migrate data
            stats = self.migrate_csv_data(csv_file_path, batch_size, update_mode)
            
            # Create indexes
            if create_indexes:
                self.create_indexes()
            
            # Generate report
            self.generate_migration_report(stats)
            
            return stats
            
        finally:
            # Always disconnect
            self.disconnect()

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Migrate CSV data to MongoDB')
    parser.add_argument('--input', '-i', 
                       default='data/spotify_listening_history_combined.csv',
                       help='Input CSV file path')
    parser.add_argument('--uri', 
                       help='MongoDB connection URI (or set MONGODB_URI env var)')
    parser.add_argument('--database', '-d',
                       help='Database name (default: spotify_analytics)')
    parser.add_argument('--collection', '-c',
                       help='Collection name (default: listening_history)')
    parser.add_argument('--batch-size', '-b', type=int, default=1000,
                       help='Batch size for bulk operations (default: 1000)')
    parser.add_argument('--update', action='store_true',
                       help='Use upsert mode to update existing documents')
    parser.add_argument('--no-indexes', action='store_true',
                       help='Skip index creation')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Check if input file exists
    if not os.path.exists(args.input):
        logger.error(f"Input file not found: {args.input}")
        return 1
    
    try:
        # Initialize migrator
        migrator = MongoDBMigrator(
            mongodb_uri=args.uri,
            database_name=args.database,
            collection_name=args.collection
        )
        
        # Run migration
        stats = migrator.run_migration(
            csv_file_path=args.input,
            batch_size=args.batch_size,
            update_mode=args.update,
            create_indexes=not args.no_indexes
        )
        
        logger.info("MongoDB migration completed successfully!")
        return 0
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())