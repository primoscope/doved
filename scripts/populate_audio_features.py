#!/usr/bin/env python3
"""
Spotify Audio Features Population Script for EchoTune AI
Fetches missing audio features from Spotify Web API and updates the dataset
"""

import pandas as pd
import requests
import time
import json
import os
import sys
from typing import List, Dict, Optional
import logging
from pathlib import Path
import base64
from urllib.parse import urlencode
import sqlite3
from tqdm import tqdm

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SpotifyAudioFeaturesPopulator:
    """Populates missing audio features using Spotify Web API"""
    
    def __init__(self, client_id: str = None, client_secret: str = None):
        self.client_id = client_id or os.getenv('SPOTIFY_CLIENT_ID')
        self.client_secret = client_secret or os.getenv('SPOTIFY_CLIENT_SECRET')
        self.access_token = None
        self.token_expires_at = 0
        
        # Rate limiting
        self.requests_per_second = 10  # Conservative rate limit
        self.requests_made = 0
        self.last_request_time = 0
        
        # Cache database for API responses
        self.cache_db_path = '/tmp/spotify_audio_features_cache.db'
        self.init_cache_db()
        
        if not self.client_id or not self.client_secret:
            logger.warning("Spotify credentials not found. Using mock mode.")
            self.mock_mode = True
        else:
            self.mock_mode = False
    
    def init_cache_db(self):
        """Initialize SQLite cache database"""
        conn = sqlite3.connect(self.cache_db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS audio_features_cache (
                track_id TEXT PRIMARY KEY,
                audio_features TEXT,
                cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def get_cached_features(self, track_id: str) -> Optional[Dict]:
        """Get cached audio features for a track"""
        conn = sqlite3.connect(self.cache_db_path)
        cursor = conn.cursor()
        
        cursor.execute(
            'SELECT audio_features FROM audio_features_cache WHERE track_id = ?',
            (track_id,)
        )
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return json.loads(result[0])
        return None
    
    def cache_features(self, track_id: str, features: Dict):
        """Cache audio features for a track"""
        conn = sqlite3.connect(self.cache_db_path)
        cursor = conn.cursor()
        
        cursor.execute(
            'INSERT OR REPLACE INTO audio_features_cache (track_id, audio_features) VALUES (?, ?)',
            (track_id, json.dumps(features))
        )
        
        conn.commit()
        conn.close()
    
    def get_access_token(self) -> str:
        """Get or refresh Spotify access token"""
        if self.mock_mode:
            return "mock_token"
        
        current_time = time.time()
        
        # Check if we need to refresh the token
        if self.access_token and current_time < self.token_expires_at:
            return self.access_token
        
        # Request new token
        auth_url = 'https://accounts.spotify.com/api/token'
        
        # Encode credentials
        auth_header = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode()
        ).decode()
        
        headers = {
            'Authorization': f'Basic {auth_header}',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        data = {
            'grant_type': 'client_credentials'
        }
        
        try:
            response = requests.post(auth_url, headers=headers, data=data)
            response.raise_for_status()
            
            token_data = response.json()
            self.access_token = token_data['access_token']
            self.token_expires_at = current_time + token_data['expires_in'] - 300  # 5 min buffer
            
            logger.info("Successfully obtained Spotify access token")
            return self.access_token
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error getting Spotify access token: {e}")
            raise
    
    def rate_limit_wait(self):
        """Implement rate limiting"""
        current_time = time.time()
        time_since_last_request = current_time - self.last_request_time
        
        if time_since_last_request < (1.0 / self.requests_per_second):
            wait_time = (1.0 / self.requests_per_second) - time_since_last_request
            time.sleep(wait_time)
        
        self.last_request_time = time.time()
        self.requests_made += 1
    
    def extract_track_id(self, spotify_uri: str) -> str:
        """Extract track ID from Spotify URI"""
        if not spotify_uri or pd.isna(spotify_uri):
            return None
        
        # Handle different URI formats
        if spotify_uri.startswith('spotify:track:'):
            return spotify_uri.split(':')[-1]
        elif spotify_uri.startswith('https://open.spotify.com/track/'):
            return spotify_uri.split('/')[-1].split('?')[0]
        else:
            # Assume it's already a track ID
            return spotify_uri
    
    def fetch_audio_features_batch(self, track_ids: List[str]) -> Dict[str, Dict]:
        """Fetch audio features for a batch of tracks (max 100)"""
        if self.mock_mode:
            return self.generate_mock_audio_features(track_ids)
        
        # Filter out None values and limit to 100
        valid_track_ids = [tid for tid in track_ids if tid][:100]
        
        if not valid_track_ids:
            return {}
        
        # Check cache first
        cached_features = {}
        uncached_track_ids = []
        
        for track_id in valid_track_ids:
            cached = self.get_cached_features(track_id)
            if cached:
                cached_features[track_id] = cached
            else:
                uncached_track_ids.append(track_id)
        
        if not uncached_track_ids:
            return cached_features
        
        # Fetch uncached features from API
        self.rate_limit_wait()
        
        token = self.get_access_token()
        url = 'https://api.spotify.com/v1/audio-features'
        
        headers = {
            'Authorization': f'Bearer {token}'
        }
        
        params = {
            'ids': ','.join(uncached_track_ids)
        }
        
        try:
            response = requests.get(url, headers=headers, params=params)
            
            if response.status_code == 429:
                # Rate limited - wait and retry
                retry_after = int(response.headers.get('Retry-After', 60))
                logger.warning(f"Rate limited. Waiting {retry_after} seconds...")
                time.sleep(retry_after)
                return self.fetch_audio_features_batch(track_ids)
            
            response.raise_for_status()
            data = response.json()
            
            # Process response
            api_features = {}
            for i, features in enumerate(data.get('audio_features', [])):
                if features:  # API returns None for tracks not found
                    track_id = uncached_track_ids[i]
                    api_features[track_id] = features
                    
                    # Cache the result
                    self.cache_features(track_id, features)
            
            # Combine cached and API results
            all_features = {**cached_features, **api_features}
            
            logger.info(f"Fetched {len(api_features)} new features, {len(cached_features)} from cache")
            
            return all_features
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching audio features: {e}")
            # Return cached features if API fails
            return cached_features
    
    def generate_mock_audio_features(self, track_ids: List[str]) -> Dict[str, Dict]:
        """Generate mock audio features for testing without API credentials"""
        import random
        
        mock_features = {}
        
        for track_id in track_ids:
            if not track_id:
                continue
                
            # Generate realistic mock values
            mock_features[track_id] = {
                'danceability': round(random.uniform(0.0, 1.0), 3),
                'energy': round(random.uniform(0.0, 1.0), 3),
                'key': random.randint(0, 11),
                'loudness': round(random.uniform(-30.0, 0.0), 3),
                'mode': random.randint(0, 1),
                'speechiness': round(random.uniform(0.0, 1.0), 3),
                'acousticness': round(random.uniform(0.0, 1.0), 3),
                'instrumentalness': round(random.uniform(0.0, 1.0), 3),
                'liveness': round(random.uniform(0.0, 1.0), 3),
                'valence': round(random.uniform(0.0, 1.0), 3),
                'tempo': round(random.uniform(60.0, 200.0), 3),
                'time_signature': random.choice([3, 4, 5]),
                'duration_ms': random.randint(30000, 600000),
                'id': track_id
            }
        
        return mock_features
    
    def populate_audio_features(self, csv_file_path: str, output_file_path: str = None) -> str:
        """Main function to populate audio features in the CSV dataset"""
        logger.info(f"Loading dataset from {csv_file_path}")
        
        # Load the dataset
        df = pd.read_csv(csv_file_path)
        original_count = len(df)
        
        logger.info(f"Loaded {original_count} records with {len(df.columns)} columns")
        
        # Extract unique track URIs that need audio features
        unique_tracks = df['spotify_track_uri'].dropna().unique()
        logger.info(f"Found {len(unique_tracks)} unique tracks")
        
        # Check how many already have audio features
        audio_feature_columns = [
            'Danceability', 'Energy', 'Key', 'Loudness', 'Mode', 
            'Speechiness', 'Acousticness', 'Instrumentalness', 
            'Liveness', 'Valence', 'Tempo', 'Time Signature'
        ]
        
        # Count tracks missing audio features
        missing_features_mask = df[audio_feature_columns].isnull().all(axis=1)
        tracks_missing_features = df[missing_features_mask]['spotify_track_uri'].dropna().unique()
        
        logger.info(f"Tracks missing audio features: {len(tracks_missing_features)}")
        
        if len(tracks_missing_features) == 0:
            logger.info("All tracks already have audio features!")
            return csv_file_path
        
        # Extract track IDs from URIs
        track_ids = [self.extract_track_id(uri) for uri in tracks_missing_features]
        track_ids = [tid for tid in track_ids if tid]  # Remove None values
        
        logger.info(f"Processing {len(track_ids)} track IDs")
        
        # Fetch audio features in batches
        batch_size = 100  # Spotify API limit
        all_features = {}
        
        with tqdm(total=len(track_ids), desc="Fetching audio features") as pbar:
            for i in range(0, len(track_ids), batch_size):
                batch = track_ids[i:i + batch_size]
                batch_features = self.fetch_audio_features_batch(batch)
                all_features.update(batch_features)
                pbar.update(len(batch))
                
                # Progress report every 10 batches
                if (i // batch_size + 1) % 10 == 0:
                    logger.info(f"Processed {i + len(batch)} / {len(track_ids)} tracks")
        
        logger.info(f"Successfully fetched features for {len(all_features)} tracks")
        
        # Update the DataFrame with fetched features
        updated_count = 0
        
        for index, row in df.iterrows():
            spotify_uri = row['spotify_track_uri']
            if pd.isna(spotify_uri):
                continue
                
            track_id = self.extract_track_id(spotify_uri)
            if track_id in all_features:
                features = all_features[track_id]
                
                # Update audio feature columns
                feature_mapping = {
                    'Danceability': 'danceability',
                    'Energy': 'energy',
                    'Key': 'key',
                    'Loudness': 'loudness',
                    'Mode': 'mode',
                    'Speechiness': 'speechiness',
                    'Acousticness': 'acousticness',
                    'Instrumentalness': 'instrumentalness',
                    'Liveness': 'liveness',
                    'Valence': 'valence',
                    'Tempo': 'tempo',
                    'Time Signature': 'time_signature'
                }
                
                for df_col, api_col in feature_mapping.items():
                    if api_col in features and pd.isna(row[df_col]):
                        df.at[index, df_col] = features[api_col]
                
                updated_count += 1
        
        logger.info(f"Updated {updated_count} records with audio features")
        
        # Save the updated dataset
        if output_file_path is None:
            output_file_path = csv_file_path.replace('.csv', '_with_audio_features.csv')
        
        # Create output directory if needed
        output_dir = os.path.dirname(output_file_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        
        df.to_csv(output_file_path, index=False)
        
        file_size = os.path.getsize(output_file_path) / (1024 * 1024)
        logger.info(f"Saved enhanced dataset to {output_file_path} ({file_size:.2f} MB)")
        
        # Generate summary report
        self.generate_enhancement_report(df, original_count, updated_count, output_file_path)
        
        return output_file_path
    
    def generate_enhancement_report(self, df: pd.DataFrame, original_count: int, 
                                  updated_count: int, output_file: str):
        """Generate a report on the audio features enhancement"""
        audio_feature_columns = [
            'Danceability', 'Energy', 'Key', 'Loudness', 'Mode', 
            'Speechiness', 'Acousticness', 'Instrumentalness', 
            'Liveness', 'Valence', 'Tempo', 'Time Signature'
        ]
        
        print("\n" + "="*70)
        print("AUDIO FEATURES ENHANCEMENT REPORT")
        print("="*70)
        
        print(f"Original Records: {original_count:,}")
        print(f"Records Updated: {updated_count:,}")
        print(f"Update Rate: {(updated_count/original_count)*100:.1f}%")
        
        print(f"\nAudio Features Coverage:")
        for col in audio_feature_columns:
            if col in df.columns:
                non_null_count = df[col].count()
                coverage = (non_null_count / len(df)) * 100
                print(f"  {col}: {coverage:.1f}% ({non_null_count:,} records)")
        
        # Calculate statistics for audio features
        print(f"\nAudio Features Statistics:")
        for col in ['Danceability', 'Energy', 'Valence', 'Tempo']:
            if col in df.columns:
                values = df[col].dropna()
                if len(values) > 0:
                    print(f"  {col}: avg={values.mean():.3f}, std={values.std():.3f}")
        
        print(f"\nEnhanced dataset saved to: {output_file}")
        
        if self.mock_mode:
            print("\n⚠️  WARNING: Mock mode was used - features are randomly generated for testing")
            print("   Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables")
            print("   to fetch real audio features from Spotify API")
        
        print("="*70)

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Populate missing audio features from Spotify API')
    parser.add_argument('--input', '-i', 
                       default='data/spotify_listening_history_combined.csv',
                       help='Input CSV file path')
    parser.add_argument('--output', '-o',
                       help='Output CSV file path (default: input_with_audio_features.csv)')
    parser.add_argument('--mock', action='store_true',
                       help='Use mock mode (generate random features for testing)')
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
        # Initialize populator
        populator = SpotifyAudioFeaturesPopulator()
        
        if args.mock:
            populator.mock_mode = True
            logger.info("Running in mock mode - will generate random audio features")
        
        # Run the population process
        output_file = populator.populate_audio_features(args.input, args.output)
        
        logger.info("Audio features population completed successfully!")
        logger.info(f"Enhanced dataset available at: {output_file}")
        
        return 0
        
    except Exception as e:
        logger.error(f"Error during audio features population: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())