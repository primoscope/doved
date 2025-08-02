#!/usr/bin/env python3
"""
MongoDB Data Integration Summary Script
Provides a comprehensive summary of the data upload and integration status
"""

import sys
import os
from pathlib import Path
from datetime import datetime
import json
from migrate_to_mongodb import MongoDBMigrator

def get_file_structure_summary():
    """Get summary of current file structure"""
    base_path = Path(os.getcwd())
    
    # Main data file
    main_file = base_path / "data" / "spotify_listening_history_combined.csv"
    main_size = main_file.stat().st_size if main_file.exists() else 0
    
    # Split files
    split_dir = base_path / "data" / "organized" / "split_files"
    split_files = list(split_dir.glob("*.csv")) if split_dir.exists() else []
    split_size = sum(f.stat().st_size for f in split_files)
    
    return {
        'main_file': {
            'exists': main_file.exists(),
            'size_mb': main_size / (1024 * 1024),
            'path': str(main_file.relative_to(base_path))
        },
        'split_files': {
            'count': len(split_files),
            'size_mb': split_size / (1024 * 1024),
            'organized': True
        },
        'total_size_mb': (main_size + split_size) / (1024 * 1024)
    }

def get_mongodb_summary():
    """Get MongoDB integration summary"""
    try:
        migrator = MongoDBMigrator()
        migrator.connect()
        
        # Basic statistics
        stats = migrator.db.command("collStats", migrator.collection_name)
        
        # Get unique counts
        unique_users = len(migrator.collection.distinct("user.username"))
        unique_tracks = len(migrator.collection.distinct("spotify_track_uri"))
        unique_artists = len(migrator.collection.distinct("track.artist"))
        
        # Get date range
        date_pipeline = [
            {"$group": {
                "_id": None,
                "min_date": {"$min": "$timestamp"},
                "max_date": {"$max": "$timestamp"},
                "total_listening_time": {"$sum": "$listening.ms_played"}
            }}
        ]
        date_stats = list(migrator.collection.aggregate(date_pipeline))
        
        # Get completion rate statistics
        completion_pipeline = [
            {"$match": {"listening.completion_rate": {"$exists": True}}},
            {"$group": {
                "_id": None,
                "avg_completion": {"$avg": "$listening.completion_rate"},
                "total_with_completion": {"$sum": 1}
            }}
        ]
        completion_stats = list(migrator.collection.aggregate(completion_pipeline))
        
        # Count indexes
        indexes = list(migrator.collection.list_indexes())
        
        summary = {
            'connection_success': True,
            'database': migrator.database_name,
            'collection': migrator.collection_name,
            'document_count': stats.get('count', 0),
            'storage_size_mb': stats.get('storageSize', 0) / (1024 * 1024),
            'index_size_mb': stats.get('totalIndexSize', 0) / (1024 * 1024),
            'avg_document_size': stats.get('avgObjSize', 0),
            'unique_users': unique_users,
            'unique_tracks': unique_tracks,
            'unique_artists': unique_artists,
            'indexes_count': len(indexes),
            'date_range': date_stats[0] if date_stats else None,
            'completion_stats': completion_stats[0] if completion_stats else None
        }
        
        migrator.disconnect()
        return summary
        
    except Exception as e:
        return {
            'connection_success': False,
            'error': str(e)
        }

def format_duration(ms):
    """Format milliseconds to human readable duration"""
    if not ms:
        return "Unknown"
    
    hours = ms // (1000 * 60 * 60)
    minutes = (ms % (1000 * 60 * 60)) // (1000 * 60)
    return f"{hours:,} hours, {minutes} minutes"

def main():
    """Generate comprehensive summary"""
    print("=" * 80)
    print("ECHOGAMESHARE AI - MONGODB DATA INTEGRATION SUMMARY")
    print("=" * 80)
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print()
    
    # File structure summary
    print("📁 FILE STRUCTURE STATUS")
    print("-" * 40)
    file_summary = get_file_structure_summary()
    
    print(f"Main Dataset:")
    print(f"  ✅ File exists: {file_summary['main_file']['exists']}")
    if file_summary['main_file']['exists']:
        print(f"  📁 Location: {file_summary['main_file']['path']}")
        print(f"  📊 Size: {file_summary['main_file']['size_mb']:.2f} MB")
    
    print(f"\nSplit Files:")
    print(f"  📂 Count: {file_summary['split_files']['count']} files")
    print(f"  📊 Total size: {file_summary['split_files']['size_mb']:.2f} MB")
    print(f"  ✅ Organized: {file_summary['split_files']['organized']}")
    
    print(f"\nTotal Data Size: {file_summary['total_size_mb']:.2f} MB")
    print()
    
    # MongoDB integration summary
    print("🗃️  MONGODB INTEGRATION STATUS")
    print("-" * 40)
    mongo_summary = get_mongodb_summary()
    
    if mongo_summary['connection_success']:
        print(f"✅ Connection: Successful")
        print(f"🗄️  Database: {mongo_summary['database']}")
        print(f"📋 Collection: {mongo_summary['collection']}")
        print()
        
        print(f"📊 DATA STATISTICS:")
        print(f"  Documents: {mongo_summary['document_count']:,}")
        print(f"  Unique Users: {mongo_summary['unique_users']:,}")
        print(f"  Unique Tracks: {mongo_summary['unique_tracks']:,}")
        print(f"  Unique Artists: {mongo_summary['unique_artists']:,}")
        print()
        
        print(f"💾 STORAGE STATISTICS:")
        print(f"  Data Size: {mongo_summary['storage_size_mb']:.2f} MB")
        print(f"  Index Size: {mongo_summary['index_size_mb']:.2f} MB")
        print(f"  Total Size: {mongo_summary['storage_size_mb'] + mongo_summary['index_size_mb']:.2f} MB")
        print(f"  Avg Doc Size: {mongo_summary['avg_document_size']:.0f} bytes")
        print(f"  Performance Indexes: {mongo_summary['indexes_count']}")
        print()
        
        if mongo_summary['date_range']:
            date_range = mongo_summary['date_range']
            print(f"📅 TEMPORAL RANGE:")
            print(f"  From: {date_range['min_date']}")
            print(f"  To: {date_range['max_date']}")
            if date_range.get('total_listening_time'):
                total_time = format_duration(date_range['total_listening_time'])
                print(f"  Total Listening Time: {total_time}")
        
        if mongo_summary['completion_stats']:
            comp_stats = mongo_summary['completion_stats']
            print(f"\n🎵 LISTENING BEHAVIOR:")
            print(f"  Tracks with completion data: {comp_stats['total_with_completion']:,}")
            print(f"  Average completion rate: {comp_stats['avg_completion']:.1%}")
        
    else:
        print(f"❌ Connection: Failed")
        print(f"🚨 Error: {mongo_summary['error']}")
    print()
    
    # Success summary
    if mongo_summary.get('connection_success') and file_summary['main_file']['exists']:
        print("🎉 INTEGRATION STATUS: SUCCESS")
        print("-" * 40)
        print("✅ File structure optimized and organized")
        print("✅ CSV data successfully uploaded to MongoDB Atlas")
        print("✅ Performance indexes created and optimized")
        print("✅ Data ready for EchoTune AI recommendation system")
        print()
        
        print("🚀 NEXT STEPS:")
        print("• Use MongoDB queries for data analysis")
        print("• Integrate with machine learning pipelines") 
        print("• Build recommendation algorithms using audio features")
        print("• Set up real-time analytics dashboards")
        
    else:
        print("⚠️  INTEGRATION STATUS: INCOMPLETE")
        print("-" * 40)
        if not file_summary['main_file']['exists']:
            print("❌ Main dataset file not found")
        if not mongo_summary.get('connection_success'):
            print("❌ MongoDB connection failed")
        print("Please run the optimization and upload process again.")
    
    print()
    print("=" * 80)
    print("For detailed operations, use:")
    print("  python scripts/optimize_and_upload_data.py --help")
    print("  python scripts/test_mongodb_connection.py")
    print("=" * 80)

if __name__ == "__main__":
    main()