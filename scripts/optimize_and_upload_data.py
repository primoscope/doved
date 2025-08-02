#!/usr/bin/env python3
"""
Data Optimization and Upload Script for EchoTune AI
Optimizes file structure and uploads all CSV data to MongoDB with comprehensive reporting
"""

import os
import sys
import shutil
import argparse
import logging
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any
import pandas as pd
from migrate_to_mongodb import MongoDBMigrator

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DataOptimizer:
    """Handles file optimization and data organization"""
    
    def __init__(self, base_path: str = None):
        self.base_path = Path(base_path or os.getcwd())
        self.data_dir = self.base_path / "data"
        self.databases_dir = self.base_path / "databases"
        self.temp_dir = self.base_path / "temp_data_processing"
        
    def analyze_csv_files(self) -> Dict[str, Any]:
        """Analyze all CSV files in the repository"""
        logger.info("Analyzing CSV files in repository...")
        
        analysis = {
            'main_file': None,
            'split_files': [],
            'duplicate_files': [],
            'total_size': 0,
            'total_records': 0
        }
        
        # Find all CSV files
        csv_files = []
        for pattern in ['**/*.csv']:
            csv_files.extend(list(self.base_path.glob(pattern)))
        
        # Categorize files
        for csv_file in csv_files:
            file_size = csv_file.stat().st_size
            analysis['total_size'] += file_size
            
            relative_path = csv_file.relative_to(self.base_path)
            
            if csv_file.name == 'spotify_listening_history_combined.csv':
                analysis['main_file'] = {
                    'path': csv_file,
                    'relative_path': relative_path,
                    'size': file_size,
                    'size_mb': file_size / (1024 * 1024)
                }
            elif csv_file.name.startswith('split_data_part_'):
                analysis['split_files'].append({
                    'path': csv_file,
                    'relative_path': relative_path,
                    'size': file_size,
                    'size_mb': file_size / (1024 * 1024)
                })
            else:
                analysis['duplicate_files'].append({
                    'path': csv_file,
                    'relative_path': relative_path,
                    'size': file_size,
                    'size_mb': file_size / (1024 * 1024)
                })
        
        # Count records in main file
        if analysis['main_file']:
            try:
                with open(analysis['main_file']['path'], 'r', encoding='utf-8') as f:
                    analysis['total_records'] = sum(1 for line in f) - 1  # Subtract header
                    analysis['main_file']['records'] = analysis['total_records']
            except Exception as e:
                logger.warning(f"Could not count records in main file: {e}")
        
        return analysis
    
    def optimize_file_structure(self, analysis: Dict[str, Any], keep_splits: bool = True) -> Dict[str, Any]:
        """Optimize the file structure by organizing and removing duplicates"""
        logger.info("Optimizing file structure...")
        
        optimization_report = {
            'files_moved': [],
            'files_removed': [],
            'space_saved': 0,
            'directories_created': []
        }
        
        # Create organized directory structure
        organized_data_dir = self.data_dir / "organized"
        if not organized_data_dir.exists():
            organized_data_dir.mkdir(parents=True, exist_ok=True)
            optimization_report['directories_created'].append(str(organized_data_dir))
        
        # Handle main file - ensure it's in the right place
        if analysis['main_file']:
            main_file = analysis['main_file']['path']
            target_path = self.data_dir / "spotify_listening_history_combined.csv"
            
            if main_file != target_path:
                if target_path.exists():
                    target_path.unlink()  # Remove existing file
                shutil.move(str(main_file), str(target_path))
                optimization_report['files_moved'].append({
                    'from': str(main_file),
                    'to': str(target_path)
                })
        
        # Handle split files - move them to organized directory
        if keep_splits and analysis['split_files']:
            splits_dir = organized_data_dir / "split_files"
            if not splits_dir.exists():
                splits_dir.mkdir(parents=True, exist_ok=True)
                optimization_report['directories_created'].append(str(splits_dir))
            
            # Keep only one copy of each split file (prefer the one in databases/)
            split_files_by_name = {}
            for split_file in analysis['split_files']:
                name = split_file['path'].name
                if name not in split_files_by_name:
                    split_files_by_name[name] = []
                split_files_by_name[name].append(split_file)
            
            for name, files in split_files_by_name.items():
                # Keep the one in databases/ directory, remove others
                preferred_file = None
                for file_info in files:
                    if 'databases' in str(file_info['relative_path']):
                        preferred_file = file_info
                        break
                
                if not preferred_file:
                    preferred_file = files[0]  # Keep the first one if none in databases/
                
                # Move preferred file to organized location
                target_path = splits_dir / name
                if preferred_file['path'] != target_path:
                    shutil.move(str(preferred_file['path']), str(target_path))
                    optimization_report['files_moved'].append({
                        'from': str(preferred_file['path']),
                        'to': str(target_path)
                    })
                
                # Remove duplicates
                for file_info in files:
                    if file_info != preferred_file and file_info['path'].exists():
                        optimization_report['space_saved'] += file_info['size']
                        file_info['path'].unlink()
                        optimization_report['files_removed'].append(str(file_info['path']))
        
        # Remove any remaining duplicate files in root directory
        root_csvs = list(self.base_path.glob("*.csv"))
        for csv_file in root_csvs:
            if csv_file.name.startswith('split_data_part_'):
                optimization_report['space_saved'] += csv_file.stat().st_size
                csv_file.unlink()
                optimization_report['files_removed'].append(str(csv_file))
        
        return optimization_report
    
    def generate_optimization_report(self, analysis: Dict[str, Any], optimization: Dict[str, Any]):
        """Generate a comprehensive optimization report"""
        print("\n" + "="*80)
        print("DATA OPTIMIZATION REPORT")
        print("="*80)
        
        print(f"\n📊 FILE ANALYSIS:")
        print(f"  Total CSV files found: {len(analysis.get('split_files', [])) + len(analysis.get('duplicate_files', [])) + (1 if analysis['main_file'] else 0)}")
        print(f"  Main file: {analysis['main_file']['relative_path'] if analysis['main_file'] else 'Not found'}")
        print(f"  Split files: {len(analysis.get('split_files', []))}")
        print(f"  Total size: {analysis['total_size'] / (1024*1024):.2f} MB")
        print(f"  Total records: {analysis.get('total_records', 'Unknown'):,}")
        
        print(f"\n🔧 OPTIMIZATION RESULTS:")
        print(f"  Files moved: {len(optimization['files_moved'])}")
        print(f"  Files removed: {len(optimization['files_removed'])}")
        print(f"  Space saved: {optimization['space_saved'] / (1024*1024):.2f} MB")
        print(f"  Directories created: {len(optimization['directories_created'])}")
        
        if optimization['files_moved']:
            print(f"\n📁 FILES MOVED:")
            for move in optimization['files_moved']:
                print(f"    {move['from']} → {move['to']}")
        
        if optimization['files_removed']:
            print(f"\n🗑️  FILES REMOVED (duplicates):")
            for removed in optimization['files_removed'][:10]:  # Show first 10
                print(f"    {removed}")
            if len(optimization['files_removed']) > 10:
                print(f"    ... and {len(optimization['files_removed']) - 10} more")
        
        print("\n" + "="*80)

class DataUploader:
    """Handles the actual data upload to MongoDB"""
    
    def __init__(self, base_path: str = None):
        self.base_path = Path(base_path or os.getcwd())
        self.data_dir = self.base_path / "data"
        
    def upload_main_dataset(self, batch_size: int = 1000, update_mode: bool = False) -> Dict[str, Any]:
        """Upload the main dataset to MongoDB"""
        main_file = self.data_dir / "spotify_listening_history_combined.csv"
        
        if not main_file.exists():
            raise FileNotFoundError(f"Main dataset not found: {main_file}")
        
        logger.info(f"Starting upload of main dataset: {main_file}")
        
        # Initialize migrator
        migrator = MongoDBMigrator()
        
        # Run migration
        stats = migrator.run_migration(
            csv_file_path=str(main_file),
            batch_size=batch_size,
            update_mode=update_mode,
            create_indexes=True
        )
        
        return stats
    
    def verify_upload(self) -> Dict[str, Any]:
        """Verify the upload by checking database statistics"""
        logger.info("Verifying upload...")
        
        migrator = MongoDBMigrator()
        try:
            migrator.connect()
            
            # Get collection statistics
            stats = migrator.db.command("collStats", migrator.collection_name)
            
            # Get sample documents
            sample_docs = list(migrator.collection.find().limit(5))
            
            # Get unique counts
            unique_users = migrator.collection.distinct("user.username")
            unique_tracks = migrator.collection.distinct("spotify_track_uri")
            unique_artists = migrator.collection.distinct("track.artist")
            
            # Get date range
            date_pipeline = [
                {"$group": {
                    "_id": None,
                    "min_date": {"$min": "$timestamp"},
                    "max_date": {"$max": "$timestamp"}
                }}
            ]
            date_range = list(migrator.collection.aggregate(date_pipeline))
            
            verification_result = {
                'document_count': stats.get('count', 0),
                'storage_size_mb': stats.get('storageSize', 0) / (1024 * 1024),
                'index_size_mb': stats.get('totalIndexSize', 0) / (1024 * 1024),
                'avg_document_size': stats.get('avgObjSize', 0),
                'unique_users': len(unique_users),
                'unique_tracks': len(unique_tracks),
                'unique_artists': len(unique_artists),
                'date_range': date_range[0] if date_range else None,
                'sample_documents': len(sample_docs),
                'indexes_count': len(list(migrator.collection.list_indexes()))
            }
            
            return verification_result
            
        finally:
            migrator.disconnect()

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Optimize and upload CSV data to MongoDB')
    parser.add_argument('--optimize-only', action='store_true',
                       help='Only optimize file structure, do not upload')
    parser.add_argument('--upload-only', action='store_true',
                       help='Only upload data, skip optimization')
    parser.add_argument('--batch-size', '-b', type=int, default=1000,
                       help='Batch size for upload (default: 1000)')
    parser.add_argument('--update-mode', action='store_true',
                       help='Use upsert mode for uploads')
    parser.add_argument('--no-splits', action='store_true',
                       help='Remove split files during optimization')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    base_path = os.getcwd()
    
    try:
        # File optimization phase
        if not args.upload_only:
            logger.info("Starting data optimization phase...")
            optimizer = DataOptimizer(base_path)
            
            # Analyze current state
            analysis = optimizer.analyze_csv_files()
            
            # Optimize file structure
            optimization = optimizer.optimize_file_structure(
                analysis, 
                keep_splits=not args.no_splits
            )
            
            # Generate report
            optimizer.generate_optimization_report(analysis, optimization)
        
        # Data upload phase
        if not args.optimize_only:
            logger.info("Starting data upload phase...")
            uploader = DataUploader(base_path)
            
            # Upload main dataset
            upload_stats = uploader.upload_main_dataset(
                batch_size=args.batch_size,
                update_mode=args.update_mode
            )
            
            # Verify upload
            verification = uploader.verify_upload()
            
            # Final report
            print("\n" + "="*80)
            print("UPLOAD VERIFICATION REPORT")
            print("="*80)
            print(f"Documents in MongoDB: {verification['document_count']:,}")
            print(f"Unique users: {verification['unique_users']:,}")
            print(f"Unique tracks: {verification['unique_tracks']:,}")
            print(f"Unique artists: {verification['unique_artists']:,}")
            print(f"Storage size: {verification['storage_size_mb']:.2f} MB")
            print(f"Index size: {verification['index_size_mb']:.2f} MB")
            print(f"Total indexes: {verification['indexes_count']}")
            
            if verification['date_range']:
                print(f"Date range: {verification['date_range']['min_date']} to {verification['date_range']['max_date']}")
            
            print("\n🎉 Data optimization and upload completed successfully! 🎉")
            print("="*80)
        
        return 0
        
    except Exception as e:
        logger.error(f"Operation failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())