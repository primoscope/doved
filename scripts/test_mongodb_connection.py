#!/usr/bin/env python3
"""
MongoDB Connection Test Script for EchoTune AI
Tests the MongoDB connection and creates required database structure
"""

import os
import sys
import logging
from datetime import datetime, timezone
from typing import Dict, Any
import json

try:
    import pymongo
    from pymongo import MongoClient
    from pymongo.errors import ConnectionFailure, ConfigurationError, OperationFailure
except ImportError as e:
    print(f"Error: pymongo not installed. Run: pip install pymongo")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError as e:
    print(f"Error: python-dotenv not installed. Run: pip install python-dotenv")
    sys.exit(1)

# Import shared MongoDB utilities
try:
    from mongodb_utils import get_sample_listening_history_document
except ImportError:
    # Fallback if mongodb_utils is not available
    def get_sample_listening_history_document():
        return {
            "_id": "sample_schema_doc",
            "spotify_track_uri": "spotify:track:example",
            "timestamp": datetime.now(timezone.utc),
            "user": {
                "username": "sample_user",
                "platform": "web_player",
                "country": "US"
            },
            "track": {
                "name": "Sample Track",
                "artist": "Sample Artist",
                "album": "Sample Album",
                "duration_ms": 210000,
                "popularity": 75
            },
            "listening": {
                "ms_played": 180000,
                "skipped": False,
                "completion_rate": 0.857
            },
            "audio_features": {
                "danceability": 0.7,
                "energy": 0.8,
                "valence": 0.6,
                "tempo": 120.0
            },
            "metadata": {
                "explicit": False,
                "created_at": datetime.now(timezone.utc)
            }
        }

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MongoDBConnectionTester:
    """Test MongoDB Atlas connection and setup required database"""
    
    def __init__(self):
        # Load environment variables
        load_dotenv()
        
        self.mongodb_uri = os.getenv('MONGODB_URI')
        self.database_name = os.getenv('MONGODB_DATABASE', 'spotify_analytics')
        self.collection_name = os.getenv('MONGODB_COLLECTION', 'listening_history')
        
        if not self.mongodb_uri:
            raise ValueError("MONGODB_URI not found in environment variables")
        
        self.client = None
        self.db = None
        self.collection = None
    
    def test_connection(self) -> bool:
        """Test basic MongoDB connection"""
        logger.info("Testing MongoDB connection...")
        
        try:
            # Create client with timeout
            self.client = MongoClient(
                self.mongodb_uri,
                serverSelectionTimeoutMS=5000,  # 5 second timeout
                connectTimeoutMS=5000,
                socketTimeoutMS=5000
            )
            
            # Test the connection
            self.client.admin.command('ping')
            logger.info("✅ MongoDB connection successful!")
            
            # Get server info
            server_info = self.client.server_info()
            logger.info(f"MongoDB Version: {server_info.get('version', 'Unknown')}")
            
            return True
            
        except ConnectionFailure as e:
            logger.error(f"❌ Connection failed: {e}")
            return False
        except ConfigurationError as e:
            logger.error(f"❌ Configuration error: {e}")
            return False
        except Exception as e:
            logger.error(f"❌ Unexpected error: {e}")
            return False
    
    def setup_database(self) -> bool:
        """Setup the required database and collection"""
        logger.info(f"Setting up database: {self.database_name}")
        
        try:
            # Access database
            self.db = self.client[self.database_name]
            
            # Access collection (creates it if it doesn't exist)
            self.collection = self.db[self.collection_name]
            
            logger.info(f"✅ Database '{self.database_name}' and collection '{self.collection_name}' ready")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error setting up database: {e}")
            return False
    
    def test_basic_operations(self) -> bool:
        """Test basic CRUD operations"""
        logger.info("Testing basic database operations...")
        
        try:
            # Test document
            test_doc = {
                "_id": "test_connection_" + datetime.now(timezone.utc).isoformat(),
                "test": True,
                "timestamp": datetime.now(timezone.utc),
                "purpose": "connection_test",
                "metadata": {
                    "created_by": "test_mongodb_connection.py",
                    "version": "1.0"
                }
            }
            
            # Insert test document
            result = self.collection.insert_one(test_doc)
            logger.info(f"✅ Insert test passed - Document ID: {result.inserted_id}")
            
            # Read test document
            found_doc = self.collection.find_one({"_id": test_doc["_id"]})
            if found_doc:
                logger.info("✅ Read test passed")
            else:
                logger.error("❌ Read test failed")
                return False
            
            # Update test document
            update_result = self.collection.update_one(
                {"_id": test_doc["_id"]},
                {"$set": {"updated": True, "update_time": datetime.now(timezone.utc)}}
            )
            logger.info(f"✅ Update test passed - Modified count: {update_result.modified_count}")
            
            # Delete test document
            delete_result = self.collection.delete_one({"_id": test_doc["_id"]})
            logger.info(f"✅ Delete test passed - Deleted count: {delete_result.deleted_count}")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Basic operations test failed: {e}")
            return False
    
    def create_sample_schema(self) -> bool:
        """Create sample schema and indexes for the listening history collection"""
        logger.info("Creating sample schema and indexes...")
        
        try:
            # Get sample document structure using shared utility
            sample_doc = get_sample_listening_history_document()
            
            # Insert sample document
            self.collection.insert_one(sample_doc)
            logger.info("✅ Sample document inserted")
            
            # Create basic indexes
            indexes_to_create = [
                {"keys": [("spotify_track_uri", 1)], "options": {"background": True}},
                {"keys": [("timestamp", -1)], "options": {"background": True}},
                {"keys": [("user.username", 1)], "options": {"background": True}},
                {"keys": [("user.username", 1), ("timestamp", -1)], "options": {"background": True}},
                {"keys": [("track.artist", 1)], "options": {"background": True}},
            ]
            
            for index_spec in indexes_to_create:
                try:
                    self.collection.create_index(index_spec["keys"], **index_spec["options"])
                    logger.info(f"✅ Created index: {index_spec['keys']}")
                except Exception as e:
                    logger.warning(f"⚠️ Index creation warning: {e}")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Schema creation failed: {e}")
            return False
    
    def get_database_info(self) -> Dict[str, Any]:
        """Get database information and statistics"""
        logger.info("Gathering database information...")
        
        info = {
            "connection_string": self.mongodb_uri.replace(
                self.mongodb_uri.split('@')[0].split('://')[1],
                "***:***"
            ),  # Hide credentials
            "database_name": self.database_name,
            "collection_name": self.collection_name,
            "server_info": {},
            "database_stats": {},
            "collection_stats": {},
            "indexes": []
        }
        
        try:
            # Server information
            server_info = self.client.server_info()
            info["server_info"] = {
                "version": server_info.get("version"),
                "buildInfo": server_info.get("buildInfo", {})
            }
            
            # Database statistics
            db_stats = self.db.command("dbStats")
            info["database_stats"] = {
                "collections": db_stats.get("collections"),
                "dataSize": db_stats.get("dataSize"),
                "storageSize": db_stats.get("storageSize"),
                "indexes": db_stats.get("indexes"),
                "indexSize": db_stats.get("indexSize")
            }
            
            # Collection statistics
            try:
                coll_stats = self.db.command("collStats", self.collection_name)
                info["collection_stats"] = {
                    "count": coll_stats.get("count"),
                    "size": coll_stats.get("size"),
                    "storageSize": coll_stats.get("storageSize"),
                    "avgObjSize": coll_stats.get("avgObjSize")
                }
            except OperationFailure:
                info["collection_stats"] = {"note": "Collection statistics not available (collection may be empty)"}
            
            # List indexes
            indexes = list(self.collection.list_indexes())
            info["indexes"] = [{"name": idx.get("name"), "key": idx.get("key")} for idx in indexes]
            
        except Exception as e:
            logger.warning(f"⚠️ Could not gather complete database info: {e}")
        
        return info
    
    def cleanup_test_data(self):
        """Clean up any test data"""
        try:
            # Remove sample schema document
            self.collection.delete_one({"_id": "sample_schema_doc"})
            logger.info("✅ Test data cleaned up")
        except Exception as e:
            logger.warning(f"⚠️ Cleanup warning: {e}")
    
    def disconnect(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()
            logger.info("✅ MongoDB connection closed")
    
    def run_full_test(self, cleanup: bool = True) -> bool:
        """Run complete connection test suite"""
        logger.info("=" * 60)
        logger.info("MONGODB CONNECTION TEST SUITE")
        logger.info("=" * 60)
        
        success = True
        
        try:
            # Test connection
            if not self.test_connection():
                return False
            
            # Setup database
            if not self.setup_database():
                return False
            
            # Test basic operations
            if not self.test_basic_operations():
                success = False
            
            # Create sample schema
            if not self.create_sample_schema():
                success = False
            
            # Get database info
            db_info = self.get_database_info()
            
            # Print results
            logger.info("\n" + "=" * 60)
            logger.info("DATABASE INFORMATION")
            logger.info("=" * 60)
            print(json.dumps(db_info, indent=2, default=str))
            
            if cleanup:
                self.cleanup_test_data()
            
            return success
            
        except Exception as e:
            logger.error(f"❌ Test suite failed: {e}")
            return False
        
        finally:
            self.disconnect()


def main():
    """Main function"""
    try:
        tester = MongoDBConnectionTester()
        success = tester.run_full_test()
        
        if success:
            print("\n" + "🎉 " * 20)
            print("ALL TESTS PASSED! MongoDB connection is working properly.")
            print("Database and collection are ready for data migration.")
            print("🎉 " * 20)
            return 0
        else:
            print("\n" + "❌ " * 20)
            print("SOME TESTS FAILED! Please check the logs above.")
            print("❌ " * 20)
            return 1
            
    except Exception as e:
        logger.error(f"Test script failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())