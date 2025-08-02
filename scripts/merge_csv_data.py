#!/usr/bin/env python3
"""
CSV Data Merger and Optimizer for EchoTune AI
Merges all split CSV files into one optimized dataset for ML training
"""

import pandas as pd
import numpy as np
import glob
import os
import sys
from pathlib import Path
import argparse
from typing import List, Tuple
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class CSVDataMerger:
    """Handles merging and optimization of CSV data files"""
    
    def __init__(self, input_pattern: str = "**/*.csv", output_file: str = "data/spotify_listening_history_combined.csv"):
        self.input_pattern = input_pattern
        self.output_file = output_file
        self.combined_df = None
        
    def find_csv_files(self) -> List[str]:
        """Find all CSV files matching the pattern"""
        csv_files = []
        
        # Find files in root directory
        csv_files.extend(glob.glob("split_data_part_*.csv"))
        
        # Find files in databases directory
        csv_files.extend(glob.glob("databases/split_data_part_*.csv"))
        
        # Remove the jf file if it exists
        csv_files = [f for f in csv_files if not f.endswith('/jf') and not f.endswith('\\jf')]
        
        logger.info(f"Found {len(csv_files)} CSV files to merge")
        for file in csv_files:
            file_size = os.path.getsize(file) / (1024 * 1024)  # Size in MB
            logger.info(f"  {file}: {file_size:.2f} MB")
            
        return csv_files
    
    def load_and_validate_csv(self, file_path: str) -> pd.DataFrame:
        """Load and validate a single CSV file"""
        try:
            df = pd.read_csv(file_path)
            logger.info(f"Loaded {file_path}: {len(df)} rows, {len(df.columns)} columns")
            
            # Basic validation
            if len(df) == 0:
                logger.warning(f"Empty file: {file_path}")
                return None
                
            # Check for required columns
            required_columns = ['spotify_track_uri', 'ts_x']
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                logger.warning(f"Missing required columns in {file_path}: {missing_columns}")
            
            return df
            
        except Exception as e:
            logger.error(f"Error loading {file_path}: {e}")
            return None
    
    def merge_csv_files(self, csv_files: List[str]) -> pd.DataFrame:
        """Merge all CSV files into a single DataFrame"""
        logger.info("Starting CSV merge process...")
        
        dfs = []
        total_rows = 0
        
        for file_path in csv_files:
            df = self.load_and_validate_csv(file_path)
            if df is not None:
                dfs.append(df)
                total_rows += len(df)
        
        if not dfs:
            raise ValueError("No valid CSV files found to merge")
        
        logger.info(f"Merging {len(dfs)} DataFrames with total {total_rows} rows...")
        
        # Combine all DataFrames
        combined_df = pd.concat(dfs, ignore_index=True, sort=False)
        
        logger.info(f"Combined dataset: {len(combined_df)} rows, {len(combined_df.columns)} columns")
        
        return combined_df
    
    def optimize_dataset(self, df: pd.DataFrame) -> pd.DataFrame:
        """Optimize the dataset for ML usage"""
        logger.info("Optimizing dataset...")
        
        original_size = len(df)
        
        # Remove duplicates
        df = df.drop_duplicates()
        duplicates_removed = original_size - len(df)
        if duplicates_removed > 0:
            logger.info(f"Removed {duplicates_removed} duplicate rows")
        
        # Sort by timestamp if available
        if 'ts_x' in df.columns:
            df['ts_x'] = pd.to_datetime(df['ts_x'], errors='coerce')
            df = df.sort_values('ts_x')
            logger.info("Sorted by timestamp")
        
        # Optimize data types
        logger.info("Optimizing data types...")
        
        # Convert categorical columns to category type
        categorical_columns = [
            'platform', 'reason_start', 'reason_end', 'conn_country',
            'master_metadata_album_artist_name_x', 'master_metadata_album_album_name_x'
        ]
        
        for col in categorical_columns:
            if col in df.columns:
                df[col] = df[col].astype('category')
        
        # Convert boolean columns
        boolean_columns = ['shuffle', 'skipped', 'offline', 'Explicit_releases']
        for col in boolean_columns:
            if col in df.columns:
                df[col] = df[col].astype('bool')
        
        # Convert numeric columns to appropriate types
        numeric_columns = [
            'ms_played_x', 'ms_played_y', 'Track Duration (ms)_releases',
            'Disc Number_releases', 'Track Number_releases', 'Popularity_releases'
        ]
        
        for col in numeric_columns:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # Convert audio features to float32 for ML efficiency
        audio_features = [
            'Danceability', 'Energy', 'Speechiness', 'Acousticness',
            'Instrumentalness', 'Liveness', 'Valence', 'Tempo'
        ]
        
        for col in audio_features:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').astype('float32')
        
        # Remove rows with missing critical data
        critical_columns = ['spotify_track_uri', 'ts_x']
        before_cleaning = len(df)
        df = df.dropna(subset=[col for col in critical_columns if col in df.columns])
        after_cleaning = len(df)
        
        if before_cleaning - after_cleaning > 0:
            logger.info(f"Removed {before_cleaning - after_cleaning} rows with missing critical data")
        
        logger.info(f"Final optimized dataset: {len(df)} rows, {len(df.columns)} columns")
        
        return df
    
    def generate_summary_stats(self, df: pd.DataFrame) -> dict:
        """Generate summary statistics for the dataset"""
        stats = {
            'total_rows': len(df),
            'total_columns': len(df.columns),
            'memory_usage_mb': df.memory_usage(deep=True).sum() / (1024 * 1024),
            'date_range': {},
            'unique_tracks': 0,
            'unique_artists': 0,
            'audio_features_coverage': {},
            'listening_time_stats': {}
        }
        
        # Date range
        if 'ts_x' in df.columns:
            stats['date_range'] = {
                'earliest': str(df['ts_x'].min()),
                'latest': str(df['ts_x'].max()),
                'span_days': (df['ts_x'].max() - df['ts_x'].min()).days
            }
        
        # Unique counts
        if 'spotify_track_uri' in df.columns:
            stats['unique_tracks'] = df['spotify_track_uri'].nunique()
        
        if 'master_metadata_album_artist_name_x' in df.columns:
            stats['unique_artists'] = df['master_metadata_album_artist_name_x'].nunique()
        
        # Audio features coverage
        audio_features = ['Danceability', 'Energy', 'Valence', 'Tempo', 'Acousticness']
        for feature in audio_features:
            if feature in df.columns:
                stats['audio_features_coverage'][feature] = {
                    'non_null_count': df[feature].count(),
                    'coverage_percentage': (df[feature].count() / len(df)) * 100
                }
        
        # Listening time statistics
        if 'ms_played_x' in df.columns:
            stats['listening_time_stats'] = {
                'total_listening_time_hours': df['ms_played_x'].sum() / (1000 * 60 * 60),
                'avg_listening_time_seconds': df['ms_played_x'].mean() / 1000,
                'median_listening_time_seconds': df['ms_played_x'].median() / 1000
            }
        
        return stats
    
    def save_dataset(self, df: pd.DataFrame, output_file: str) -> None:
        """Save the optimized dataset"""
        # Create output directory if it doesn't exist
        output_dir = os.path.dirname(output_file)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        
        logger.info(f"Saving optimized dataset to {output_file}...")
        df.to_csv(output_file, index=False)
        
        file_size = os.path.getsize(output_file) / (1024 * 1024)
        logger.info(f"Saved dataset: {file_size:.2f} MB")
    
    def run(self) -> Tuple[pd.DataFrame, dict]:
        """Run the complete merge and optimization process"""
        logger.info("Starting CSV data merger and optimizer...")
        
        # Find CSV files
        csv_files = self.find_csv_files()
        
        if not csv_files:
            raise ValueError("No CSV files found to merge")
        
        # Merge files
        combined_df = self.merge_csv_files(csv_files)
        
        # Optimize dataset
        optimized_df = self.optimize_dataset(combined_df)
        
        # Generate summary statistics
        stats = self.generate_summary_stats(optimized_df)
        
        # Save optimized dataset
        self.save_dataset(optimized_df, self.output_file)
        
        # Store for later use
        self.combined_df = optimized_df
        
        logger.info("CSV merge and optimization completed successfully!")
        
        return optimized_df, stats

def print_summary_report(stats: dict) -> None:
    """Print a summary report of the merged dataset"""
    print("\n" + "="*60)
    print("ECHOTUNE AI - DATASET SUMMARY REPORT")
    print("="*60)
    
    print(f"Total Rows: {stats['total_rows']:,}")
    print(f"Total Columns: {stats['total_columns']}")
    print(f"Memory Usage: {stats['memory_usage_mb']:.2f} MB")
    
    if stats['date_range']:
        print(f"\nDate Range:")
        print(f"  Earliest: {stats['date_range']['earliest']}")
        print(f"  Latest: {stats['date_range']['latest']}")
        print(f"  Span: {stats['date_range']['span_days']} days")
    
    print(f"\nUnique Tracks: {stats['unique_tracks']:,}")
    print(f"Unique Artists: {stats['unique_artists']:,}")
    
    if stats['listening_time_stats']:
        print(f"\nListening Time Statistics:")
        print(f"  Total Hours: {stats['listening_time_stats']['total_listening_time_hours']:.2f}")
        print(f"  Avg per Track: {stats['listening_time_stats']['avg_listening_time_seconds']:.1f}s")
        print(f"  Median per Track: {stats['listening_time_stats']['median_listening_time_seconds']:.1f}s")
    
    if stats['audio_features_coverage']:
        print(f"\nAudio Features Coverage:")
        for feature, coverage in stats['audio_features_coverage'].items():
            print(f"  {feature}: {coverage['coverage_percentage']:.1f}% ({coverage['non_null_count']:,} records)")
    
    print("\n" + "="*60)
    print("Dataset is ready for ML training and recommendation engine!")
    print("="*60)

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Merge and optimize CSV data files for EchoTune AI')
    parser.add_argument('--output', '-o', default='data/spotify_listening_history_combined.csv',
                       help='Output file path for merged dataset')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    try:
        # Initialize merger
        merger = CSVDataMerger(output_file=args.output)
        
        # Run merge and optimization
        df, stats = merger.run()
        
        # Print summary report
        print_summary_report(stats)
        
        return 0
        
    except Exception as e:
        logger.error(f"Error during CSV merge process: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())