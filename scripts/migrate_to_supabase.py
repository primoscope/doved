#!/usr/bin/env python3
"""
Supabase (PostgreSQL) Migration Script for EchoTune AI
Creates normalized schema and migrates user/application data
"""

import pandas as pd
import psycopg2
from psycopg2.extras import execute_batch, RealDictCursor
import os
import sys
from datetime import datetime, timezone
import logging
from typing import List, Dict, Any, Optional
import json
from tqdm import tqdm
import argparse
import uuid

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SupabaseMigrator:
    """Handles migration of data to Supabase (PostgreSQL) with normalized schema"""
    
    def __init__(self, database_url: str = None):
        self.database_url = database_url or os.getenv('DATABASE_URL')
        
        if not self.database_url:
            raise ValueError("Database URL not provided. Set DATABASE_URL environment variable.")
        
        self.conn = None
        self.cursor = None
        
    def connect(self):
        """Connect to PostgreSQL"""
        try:
            self.conn = psycopg2.connect(self.database_url)
            self.cursor = self.conn.cursor(cursor_factory=RealDictCursor)
            
            # Test connection
            self.cursor.execute("SELECT version();")
            version = self.cursor.fetchone()
            logger.info(f"Connected to PostgreSQL: {version['version']}")
            
        except Exception as e:
            logger.error(f"Error connecting to PostgreSQL: {e}")
            raise
    
    def disconnect(self):
        """Disconnect from PostgreSQL"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        logger.info("Disconnected from PostgreSQL")
    
    def create_schema(self):
        """Create the normalized database schema"""
        logger.info("Creating database schema...")
        
        schema_sql = """
        -- Enable UUID extension
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        
        -- Users table
        CREATE TABLE IF NOT EXISTS users (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            spotify_user_id TEXT UNIQUE,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            display_name TEXT,
            country TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_active_at TIMESTAMP WITH TIME ZONE
        );
        
        -- Artists table
        CREATE TABLE IF NOT EXISTS artists (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            spotify_artist_id TEXT UNIQUE,
            name TEXT NOT NULL,
            spotify_uri TEXT,
            genres TEXT[],
            popularity INTEGER,
            followers INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        -- Albums table
        CREATE TABLE IF NOT EXISTS albums (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            spotify_album_id TEXT UNIQUE,
            name TEXT NOT NULL,
            spotify_uri TEXT,
            release_date DATE,
            total_tracks INTEGER,
            album_type TEXT, -- album, single, compilation
            label TEXT,
            genres TEXT[],
            image_url TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        -- Album artists relationship
        CREATE TABLE IF NOT EXISTS album_artists (
            album_id UUID REFERENCES albums(id) ON DELETE CASCADE,
            artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
            PRIMARY KEY (album_id, artist_id)
        );
        
        -- Tracks table
        CREATE TABLE IF NOT EXISTS tracks (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            spotify_track_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            spotify_uri TEXT,
            album_id UUID REFERENCES albums(id) ON DELETE SET NULL,
            duration_ms INTEGER,
            track_number INTEGER,
            disc_number INTEGER,
            explicit BOOLEAN DEFAULT FALSE,
            popularity INTEGER,
            preview_url TEXT,
            isrc TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        -- Track artists relationship (for featuring artists)
        CREATE TABLE IF NOT EXISTS track_artists (
            track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
            artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
            role TEXT DEFAULT 'primary', -- primary, featured
            PRIMARY KEY (track_id, artist_id, role)
        );
        
        -- Audio features table
        CREATE TABLE IF NOT EXISTS audio_features (
            track_id UUID REFERENCES tracks(id) ON DELETE CASCADE PRIMARY KEY,
            danceability REAL,
            energy REAL,
            key INTEGER,
            loudness REAL,
            mode INTEGER,
            speechiness REAL,
            acousticness REAL,
            instrumentalness REAL,
            liveness REAL,
            valence REAL,
            tempo REAL,
            time_signature INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        -- Listening history table
        CREATE TABLE IF NOT EXISTS listening_history (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
            played_at TIMESTAMP WITH TIME ZONE NOT NULL,
            ms_played INTEGER,
            completion_rate REAL,
            skipped BOOLEAN DEFAULT FALSE,
            shuffle BOOLEAN DEFAULT FALSE,
            offline BOOLEAN DEFAULT FALSE,
            reason_start TEXT,
            reason_end TEXT,
            platform TEXT,
            ip_address INET,
            user_agent TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        -- Playlists table
        CREATE TABLE IF NOT EXISTS playlists (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            spotify_playlist_id TEXT,
            name TEXT NOT NULL,
            description TEXT,
            public BOOLEAN DEFAULT FALSE,
            collaborative BOOLEAN DEFAULT FALSE,
            snapshot_id TEXT,
            image_url TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        -- Playlist tracks relationship
        CREATE TABLE IF NOT EXISTS playlist_tracks (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
            track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
            added_by UUID REFERENCES users(id) ON DELETE SET NULL,
            added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            position INTEGER,
            UNIQUE(playlist_id, track_id, added_at)
        );
        
        -- User preferences table
        CREATE TABLE IF NOT EXISTS user_preferences (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
            preferred_genres TEXT[],
            audio_feature_weights JSONB,
            recommendation_settings JSONB,
            privacy_settings JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        -- Recommendations table (for ML model outputs)
        CREATE TABLE IF NOT EXISTS recommendations (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
            score REAL NOT NULL,
            model_version TEXT,
            context JSONB, -- context when recommendation was made
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE,
            UNIQUE(user_id, track_id, model_version)
        );
        
        -- User interactions (likes, saves, etc.)
        CREATE TABLE IF NOT EXISTS user_interactions (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
            interaction_type TEXT NOT NULL, -- like, save, skip, dislike
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, track_id, interaction_type)
        );
        """
        
        try:
            self.cursor.execute(schema_sql)
            self.conn.commit()
            logger.info("Database schema created successfully")
        except Exception as e:
            logger.error(f"Error creating schema: {e}")
            self.conn.rollback()
            raise
    
    def create_indexes(self):
        """Create performance indexes"""
        logger.info("Creating database indexes...")
        
        indexes_sql = """
        -- Users indexes
        CREATE INDEX IF NOT EXISTS idx_users_spotify_id ON users(spotify_user_id);
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at DESC);
        
        -- Artists indexes
        CREATE INDEX IF NOT EXISTS idx_artists_spotify_id ON artists(spotify_artist_id);
        CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
        CREATE INDEX IF NOT EXISTS idx_artists_genres ON artists USING GIN(genres);
        
        -- Albums indexes
        CREATE INDEX IF NOT EXISTS idx_albums_spotify_id ON albums(spotify_album_id);
        CREATE INDEX IF NOT EXISTS idx_albums_name ON albums(name);
        CREATE INDEX IF NOT EXISTS idx_albums_release_date ON albums(release_date DESC);
        CREATE INDEX IF NOT EXISTS idx_albums_genres ON albums USING GIN(genres);
        
        -- Tracks indexes
        CREATE INDEX IF NOT EXISTS idx_tracks_spotify_id ON tracks(spotify_track_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_name ON tracks(name);
        CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_popularity ON tracks(popularity DESC);
        
        -- Audio features indexes
        CREATE INDEX IF NOT EXISTS idx_audio_danceability ON audio_features(danceability);
        CREATE INDEX IF NOT EXISTS idx_audio_energy ON audio_features(energy);
        CREATE INDEX IF NOT EXISTS idx_audio_valence ON audio_features(valence);
        CREATE INDEX IF NOT EXISTS idx_audio_tempo ON audio_features(tempo);
        
        -- Listening history indexes
        CREATE INDEX IF NOT EXISTS idx_listening_user_id ON listening_history(user_id);
        CREATE INDEX IF NOT EXISTS idx_listening_track_id ON listening_history(track_id);
        CREATE INDEX IF NOT EXISTS idx_listening_played_at ON listening_history(played_at DESC);
        CREATE INDEX IF NOT EXISTS idx_listening_user_played ON listening_history(user_id, played_at DESC);
        CREATE INDEX IF NOT EXISTS idx_listening_completion ON listening_history(completion_rate DESC) WHERE completion_rate IS NOT NULL;
        
        -- Playlists indexes
        CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
        CREATE INDEX IF NOT EXISTS idx_playlists_spotify_id ON playlists(spotify_playlist_id);
        CREATE INDEX IF NOT EXISTS idx_playlists_public ON playlists(public, created_at DESC) WHERE public = TRUE;
        
        -- Playlist tracks indexes
        CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id, position);
        CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);
        
        -- User preferences indexes
        CREATE INDEX IF NOT EXISTS idx_user_prefs_user_id ON user_preferences(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_prefs_genres ON user_preferences USING GIN(preferred_genres);
        CREATE INDEX IF NOT EXISTS idx_user_prefs_audio_weights ON user_preferences USING GIN(audio_feature_weights);
        
        -- Recommendations indexes
        CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON recommendations(user_id, score DESC);
        CREATE INDEX IF NOT EXISTS idx_recommendations_track_id ON recommendations(track_id);
        CREATE INDEX IF NOT EXISTS idx_recommendations_expires ON recommendations(expires_at) WHERE expires_at IS NOT NULL;
        
        -- User interactions indexes
        CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON user_interactions(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_interactions_track_id ON user_interactions(track_id);
        CREATE INDEX IF NOT EXISTS idx_interactions_type ON user_interactions(interaction_type, created_at DESC);
        
        -- Full-text search indexes
        CREATE INDEX IF NOT EXISTS idx_tracks_search ON tracks USING GIN(to_tsvector('english', name));
        CREATE INDEX IF NOT EXISTS idx_artists_search ON artists USING GIN(to_tsvector('english', name));
        CREATE INDEX IF NOT EXISTS idx_albums_search ON albums USING GIN(to_tsvector('english', name));
        """
        
        try:
            self.cursor.execute(indexes_sql)
            self.conn.commit()
            logger.info("Database indexes created successfully")
        except Exception as e:
            logger.error(f"Error creating indexes: {e}")
            self.conn.rollback()
            raise
    
    def create_rls_policies(self):
        """Create Row Level Security policies"""
        logger.info("Creating Row Level Security policies...")
        
        rls_sql = """
        -- Enable RLS on tables
        ALTER TABLE users ENABLE ROW LEVEL SECURITY;
        ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
        ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
        ALTER TABLE listening_history ENABLE ROW LEVEL SECURITY;
        ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
        ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
        
        -- Users can only see their own data
        CREATE POLICY user_isolation_policy ON users
            FOR ALL USING (auth.uid() = id);
        
        CREATE POLICY playlist_isolation_policy ON playlists
            FOR ALL USING (auth.uid() = user_id OR public = TRUE);
        
        CREATE POLICY preferences_isolation_policy ON user_preferences
            FOR ALL USING (auth.uid() = user_id);
        
        CREATE POLICY listening_isolation_policy ON listening_history
            FOR ALL USING (auth.uid() = user_id);
        
        CREATE POLICY recommendations_isolation_policy ON recommendations
            FOR ALL USING (auth.uid() = user_id);
        
        CREATE POLICY interactions_isolation_policy ON user_interactions
            FOR ALL USING (auth.uid() = user_id);
        """
        
        try:
            self.cursor.execute(rls_sql)
            self.conn.commit()
            logger.info("RLS policies created successfully")
        except Exception as e:
            logger.warning(f"Error creating RLS policies (may require Supabase): {e}")
            self.conn.rollback()
    
    def extract_unique_entities(self, df: pd.DataFrame) -> Dict[str, pd.DataFrame]:
        """Extract unique entities from the CSV data"""
        logger.info("Extracting unique entities from CSV data...")
        
        entities = {}
        
        # Extract unique users
        user_cols = ['username', 'conn_country']
        users_df = df[user_cols].drop_duplicates().dropna(subset=['username'])
        users_df['id'] = [str(uuid.uuid4()) for _ in range(len(users_df))]
        users_df['spotify_user_id'] = users_df['username']
        users_df['country'] = users_df['conn_country']
        entities['users'] = users_df[['id', 'spotify_user_id', 'username', 'country']]
        
        # Extract unique artists
        artist_cols = ['master_metadata_album_artist_name_x', 'Artist URI(s)_releases', 'Artist Genres']
        artists_df = df[artist_cols].drop_duplicates().dropna(subset=['master_metadata_album_artist_name_x'])
        artists_df['id'] = [str(uuid.uuid4()) for _ in range(len(artists_df))]
        artists_df['name'] = artists_df['master_metadata_album_artist_name_x']
        artists_df['spotify_uri'] = artists_df['Artist URI(s)_releases']
        artists_df['genres'] = artists_df['Artist Genres'].apply(
            lambda x: x.split(',') if pd.notna(x) and x else []
        )
        entities['artists'] = artists_df[['id', 'name', 'spotify_uri', 'genres']]
        
        # Extract unique albums
        album_cols = [
            'master_metadata_album_album_name_x', 'Album URI_releases', 
            'Album Release Date_releases', 'Album Genres', 'Label'
        ]
        albums_df = df[album_cols].drop_duplicates().dropna(subset=['master_metadata_album_album_name_x'])
        albums_df['id'] = [str(uuid.uuid4()) for _ in range(len(albums_df))]
        albums_df['name'] = albums_df['master_metadata_album_album_name_x']
        albums_df['spotify_uri'] = albums_df['Album URI_releases']
        albums_df['release_date'] = pd.to_datetime(albums_df['Album Release Date_releases'], errors='coerce')
        albums_df['label'] = albums_df['Label']
        albums_df['genres'] = albums_df['Album Genres'].apply(
            lambda x: x.split(',') if pd.notna(x) and x else []
        )
        entities['albums'] = albums_df[['id', 'name', 'spotify_uri', 'release_date', 'label', 'genres']]
        
        # Extract unique tracks
        track_cols = [
            'spotify_track_uri', 'master_metadata_track_name_x', 'Track Duration (ms)_releases',
            'Track Number_releases', 'Disc Number_releases', 'Explicit_releases',
            'Popularity_releases', 'Track Preview URL_releases', 'ISRC_releases'
        ]
        tracks_df = df[track_cols].drop_duplicates().dropna(subset=['spotify_track_uri'])
        tracks_df['id'] = [str(uuid.uuid4()) for _ in range(len(tracks_df))]
        tracks_df['spotify_track_id'] = tracks_df['spotify_track_uri'].str.replace('spotify:track:', '')
        tracks_df['name'] = tracks_df['master_metadata_track_name_x']
        tracks_df['spotify_uri'] = tracks_df['spotify_track_uri']
        tracks_df['duration_ms'] = tracks_df['Track Duration (ms)_releases']
        tracks_df['track_number'] = tracks_df['Track Number_releases']
        tracks_df['disc_number'] = tracks_df['Disc Number_releases']
        tracks_df['explicit'] = tracks_df['Explicit_releases'].fillna(False)
        tracks_df['popularity'] = tracks_df['Popularity_releases']
        tracks_df['preview_url'] = tracks_df['Track Preview URL_releases']
        tracks_df['isrc'] = tracks_df['ISRC_releases']
        entities['tracks'] = tracks_df[[
            'id', 'spotify_track_id', 'name', 'spotify_uri', 'duration_ms',
            'track_number', 'disc_number', 'explicit', 'popularity', 'preview_url', 'isrc'
        ]]
        
        logger.info(f"Extracted entities: {len(entities['users'])} users, {len(entities['artists'])} artists, "
                   f"{len(entities['albums'])} albums, {len(entities['tracks'])} tracks")
        
        return entities
    
    def insert_entities(self, entities: Dict[str, pd.DataFrame]) -> Dict[str, Dict]:
        """Insert entities into database and return ID mappings"""
        logger.info("Inserting entities into database...")
        
        id_mappings = {}
        
        # Insert users
        users_data = []
        for _, row in entities['users'].iterrows():
            users_data.append((
                row['id'], row['spotify_user_id'], row['username'], row['country']
            ))
        
        if users_data:
            execute_batch(
                self.cursor,
                """INSERT INTO users (id, spotify_user_id, username, country) 
                   VALUES (%s, %s, %s, %s) ON CONFLICT (username) DO NOTHING""",
                users_data
            )
            
            # Create username -> id mapping
            self.cursor.execute("SELECT id, username FROM users")
            id_mappings['users'] = {row['username']: row['id'] for row in self.cursor.fetchall()}
        
        # Insert artists
        artists_data = []
        for _, row in entities['artists'].iterrows():
            artists_data.append((
                row['id'], row['name'], row['spotify_uri'], row['genres']
            ))
        
        if artists_data:
            execute_batch(
                self.cursor,
                """INSERT INTO artists (id, name, spotify_uri, genres) 
                   VALUES (%s, %s, %s, %s) ON CONFLICT (name) DO NOTHING""",
                artists_data
            )
            
            # Create name -> id mapping
            self.cursor.execute("SELECT id, name FROM artists")
            id_mappings['artists'] = {row['name']: row['id'] for row in self.cursor.fetchall()}
        
        # Insert albums
        albums_data = []
        for _, row in entities['albums'].iterrows():
            albums_data.append((
                row['id'], row['name'], row['spotify_uri'], row['release_date'],
                row['label'], row['genres']
            ))
        
        if albums_data:
            execute_batch(
                self.cursor,
                """INSERT INTO albums (id, name, spotify_uri, release_date, label, genres) 
                   VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (name) DO NOTHING""",
                albums_data
            )
            
            # Create name -> id mapping
            self.cursor.execute("SELECT id, name FROM albums")
            id_mappings['albums'] = {row['name']: row['id'] for row in self.cursor.fetchall()}
        
        # Insert tracks
        tracks_data = []
        for _, row in entities['tracks'].iterrows():
            tracks_data.append((
                row['id'], row['spotify_track_id'], row['name'], row['spotify_uri'],
                row['duration_ms'], row['track_number'], row['disc_number'],
                row['explicit'], row['popularity'], row['preview_url'], row['isrc']
            ))
        
        if tracks_data:
            execute_batch(
                self.cursor,
                """INSERT INTO tracks (id, spotify_track_id, name, spotify_uri, duration_ms,
                   track_number, disc_number, explicit, popularity, preview_url, isrc) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) 
                   ON CONFLICT (spotify_track_id) DO NOTHING""",
                tracks_data
            )
            
            # Create spotify_track_id -> id mapping
            self.cursor.execute("SELECT id, spotify_track_id FROM tracks")
            id_mappings['tracks'] = {row['spotify_track_id']: row['id'] for row in self.cursor.fetchall()}
        
        self.conn.commit()
        logger.info("Entities inserted successfully")
        
        return id_mappings
    
    def insert_listening_history(self, df: pd.DataFrame, id_mappings: Dict[str, Dict], 
                                batch_size: int = 1000) -> int:
        """Insert listening history data"""
        logger.info("Inserting listening history...")
        
        inserted_count = 0
        batch_data = []
        
        with tqdm(total=len(df), desc="Processing listening history") as pbar:
            for _, row in df.iterrows():
                try:
                    # Get IDs from mappings
                    user_id = id_mappings['users'].get(row.get('username'))
                    track_spotify_id = row.get('spotify_track_uri', '').replace('spotify:track:', '')
                    track_id = id_mappings['tracks'].get(track_spotify_id)
                    
                    if not user_id or not track_id:
                        pbar.update(1)
                        continue
                    
                    # Parse timestamp
                    played_at = pd.to_datetime(row.get('ts_x'), errors='coerce')
                    if pd.isna(played_at):
                        pbar.update(1)
                        continue
                    
                    # Calculate completion rate
                    ms_played = row.get('ms_played_x')
                    duration_ms = row.get('Track Duration (ms)_releases')
                    completion_rate = None
                    
                    if pd.notna(ms_played) and pd.notna(duration_ms) and duration_ms > 0:
                        completion_rate = min(float(ms_played) / float(duration_ms), 1.0)
                    
                    batch_data.append((
                        user_id, track_id, played_at, ms_played, completion_rate,
                        row.get('skipped', False), row.get('shuffle', False),
                        row.get('offline', False), row.get('reason_start'),
                        row.get('reason_end'), row.get('platform'),
                        row.get('ip_addr_decrypted'), row.get('user_agent_decrypted')
                    ))
                    
                    # Execute batch
                    if len(batch_data) >= batch_size:
                        self._execute_listening_batch(batch_data)
                        inserted_count += len(batch_data)
                        batch_data = []
                
                except Exception as e:
                    logger.warning(f"Error processing listening record: {e}")
                
                pbar.update(1)
        
        # Execute remaining batch
        if batch_data:
            self._execute_listening_batch(batch_data)
            inserted_count += len(batch_data)
        
        self.conn.commit()
        logger.info(f"Inserted {inserted_count} listening history records")
        
        return inserted_count
    
    def _execute_listening_batch(self, batch_data: List):
        """Execute a batch of listening history inserts"""
        execute_batch(
            self.cursor,
            """INSERT INTO listening_history 
               (user_id, track_id, played_at, ms_played, completion_rate, skipped, 
                shuffle, offline, reason_start, reason_end, platform, ip_address, user_agent)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            batch_data
        )
    
    def insert_audio_features(self, df: pd.DataFrame, id_mappings: Dict[str, Dict]) -> int:
        """Insert audio features data"""
        logger.info("Inserting audio features...")
        
        audio_feature_columns = [
            'Danceability', 'Energy', 'Key', 'Loudness', 'Mode',
            'Speechiness', 'Acousticness', 'Instrumentalness',
            'Liveness', 'Valence', 'Tempo', 'Time Signature'
        ]
        
        # Get unique tracks with audio features
        audio_features_df = df[['spotify_track_uri'] + audio_feature_columns].drop_duplicates()
        audio_features_df = audio_features_df.dropna(subset=['spotify_track_uri'])
        
        batch_data = []
        for _, row in audio_features_df.iterrows():
            track_spotify_id = row['spotify_track_uri'].replace('spotify:track:', '')
            track_id = id_mappings['tracks'].get(track_spotify_id)
            
            if not track_id:
                continue
            
            # Check if any audio features are present
            features = [row.get(col) for col in audio_feature_columns]
            if all(pd.isna(f) for f in features):
                continue
            
            batch_data.append((
                track_id,
                row.get('Danceability'), row.get('Energy'), row.get('Key'),
                row.get('Loudness'), row.get('Mode'), row.get('Speechiness'),
                row.get('Acousticness'), row.get('Instrumentalness'),
                row.get('Liveness'), row.get('Valence'), row.get('Tempo'),
                row.get('Time Signature')
            ))
        
        if batch_data:
            execute_batch(
                self.cursor,
                """INSERT INTO audio_features 
                   (track_id, danceability, energy, key, loudness, mode, speechiness,
                    acousticness, instrumentalness, liveness, valence, tempo, time_signature)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (track_id) DO NOTHING""",
                batch_data
            )
            
            self.conn.commit()
        
        logger.info(f"Inserted {len(batch_data)} audio features records")
        return len(batch_data)
    
    def generate_migration_report(self, stats: Dict[str, int]):
        """Generate migration report"""
        print("\n" + "="*60)
        print("SUPABASE MIGRATION REPORT")
        print("="*60)
        
        for table, count in stats.items():
            print(f"{table.title()}: {count:,} records")
        
        # Database statistics
        try:
            self.cursor.execute("""
                SELECT schemaname, tablename, n_tup_ins as inserts, n_tup_upd as updates
                FROM pg_stat_user_tables 
                WHERE schemaname = 'public'
                ORDER BY tablename
            """)
            
            print(f"\nTable Statistics:")
            for row in self.cursor.fetchall():
                print(f"  {row['tablename']}: {row['inserts']:,} inserts, {row['updates']:,} updates")
        
        except Exception as e:
            logger.warning(f"Could not retrieve table statistics: {e}")
        
        print("\n" + "="*60)
        print("Migration completed successfully!")
        print("="*60)
    
    def run_migration(self, csv_file_path: str, batch_size: int = 1000) -> Dict[str, int]:
        """Run the complete migration process"""
        try:
            # Connect to database
            self.connect()
            
            # Create schema
            self.create_schema()
            self.create_indexes()
            # self.create_rls_policies()  # Uncomment for Supabase
            
            # Load CSV data
            logger.info(f"Loading CSV data from {csv_file_path}")
            df = pd.read_csv(csv_file_path)
            
            # Extract and insert entities
            entities = self.extract_unique_entities(df)
            id_mappings = self.insert_entities(entities)
            
            # Insert listening history and audio features
            listening_count = self.insert_listening_history(df, id_mappings, batch_size)
            audio_features_count = self.insert_audio_features(df, id_mappings)
            
            # Compile statistics
            stats = {
                'users': len(entities['users']),
                'artists': len(entities['artists']),
                'albums': len(entities['albums']),
                'tracks': len(entities['tracks']),
                'listening_history': listening_count,
                'audio_features': audio_features_count
            }
            
            # Generate report
            self.generate_migration_report(stats)
            
            return stats
            
        finally:
            # Always disconnect
            self.disconnect()

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Migrate CSV data to Supabase (PostgreSQL)')
    parser.add_argument('--input', '-i',
                       default='data/spotify_listening_history_combined.csv',
                       help='Input CSV file path')
    parser.add_argument('--database-url',
                       help='PostgreSQL connection URL (or set DATABASE_URL env var)')
    parser.add_argument('--batch-size', '-b', type=int, default=1000,
                       help='Batch size for bulk operations (default: 1000)')
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
        migrator = SupabaseMigrator(database_url=args.database_url)
        
        # Run migration
        stats = migrator.run_migration(
            csv_file_path=args.input,
            batch_size=args.batch_size
        )
        
        logger.info("Supabase migration completed successfully!")
        return 0
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())