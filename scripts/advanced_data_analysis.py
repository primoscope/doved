#!/usr/bin/env python3
"""
Advanced Data Analysis Script for EchoTune AI
Provides comprehensive analytics and insights from the MongoDB listening history data
"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime, timedelta
import pandas as pd
from collections import defaultdict
from migrate_to_mongodb import MongoDBMigrator

class AdvancedDataAnalyzer:
    """Advanced analytics for Spotify listening history in MongoDB"""
    
    def __init__(self):
        self.migrator = MongoDBMigrator()
        self.migrator.connect()
        self.collection = self.migrator.collection
    
    def get_listening_patterns(self):
        """Analyze listening patterns by time of day and day of week"""
        pipeline = [
            {
                "$project": {
                    "timestamp": 1,
                    "track": 1,
                    "listening": 1,
                    "hour": {"$hour": "$timestamp"},
                    "dayOfWeek": {"$dayOfWeek": "$timestamp"},
                    "dayOfYear": {"$dayOfYear": "$timestamp"},
                    "year": {"$year": "$timestamp"}
                }
            },
            {
                "$group": {
                    "_id": {
                        "hour": "$hour",
                        "dayOfWeek": "$dayOfWeek"
                    },
                    "listening_sessions": {"$sum": 1},
                    "total_time": {"$sum": "$listening.ms_played"},
                    "avg_completion": {"$avg": "$listening.completion_rate"}
                }
            },
            {"$sort": {"_id.dayOfWeek": 1, "_id.hour": 1}}
        ]
        
        return list(self.collection.aggregate(pipeline))
    
    def get_music_discovery_timeline(self):
        """Track music discovery over time"""
        pipeline = [
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$timestamp"},
                        "month": {"$month": "$timestamp"}
                    },
                    "unique_tracks": {"$addToSet": "$spotify_track_uri"},
                    "unique_artists": {"$addToSet": "$track.artist"},
                    "total_listening_time": {"$sum": "$listening.ms_played"}
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "new_tracks_discovered": {"$size": "$unique_tracks"},
                    "new_artists_discovered": {"$size": "$unique_artists"},
                    "total_listening_hours": {"$divide": ["$total_listening_time", 3600000]}
                }
            },
            {"$sort": {"_id.year": 1, "_id.month": 1}}
        ]
        
        return list(self.collection.aggregate(pipeline))
    
    def get_top_artists_evolution(self, limit=20):
        """Track how top artists change over time"""
        pipeline = [
            {
                "$group": {
                    "_id": {
                        "artist": "$track.artist",
                        "year": {"$year": "$timestamp"}
                    },
                    "play_count": {"$sum": 1},
                    "total_time": {"$sum": "$listening.ms_played"}
                }
            },
            {
                "$group": {
                    "_id": "$_id.year",
                    "artists": {
                        "$push": {
                            "artist": "$_id.artist",
                            "play_count": "$play_count",
                            "total_time": "$total_time"
                        }
                    }
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "top_artists": {
                        "$slice": [
                            {"$sortArray": {
                                "input": "$artists",
                                "sortBy": {"play_count": -1}
                            }},
                            limit
                        ]
                    }
                }
            },
            {"$sort": {"_id": 1}}
        ]
        
        return list(self.collection.aggregate(pipeline))
    
    def get_skip_behavior_analysis(self):
        """Analyze skip behavior and completion rates"""
        pipeline = [
            {
                "$match": {
                    "listening.completion_rate": {"$exists": True}
                }
            },
            {
                "$bucket": {
                    "groupBy": "$listening.completion_rate",
                    "boundaries": [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0],
                    "default": "other",
                    "output": {
                        "count": {"$sum": 1},
                        "avg_play_time": {"$avg": "$listening.ms_played"},
                        "sample_tracks": {
                            "$push": {
                                "track": "$track.name",
                                "artist": "$track.artist",
                                "completion_rate": "$listening.completion_rate"
                            }
                        }
                    }
                }
            }
        ]
        
        return list(self.collection.aggregate(pipeline))
    
    def get_audio_features_analysis(self):
        """Analyze audio features preferences over time"""
        pipeline = [
            {
                "$match": {
                    "audio_features": {"$exists": True}
                }
            },
            {
                "$group": {
                    "_id": {"$year": "$timestamp"},
                    "avg_danceability": {"$avg": "$audio_features.danceability"},
                    "avg_energy": {"$avg": "$audio_features.energy"},
                    "avg_valence": {"$avg": "$audio_features.valence"},
                    "avg_tempo": {"$avg": "$audio_features.tempo"},
                    "track_count": {"$sum": 1}
                }
            },
            {"$sort": {"_id": 1}}
        ]
        
        return list(self.collection.aggregate(pipeline))
    
    def get_seasonal_preferences(self):
        """Analyze how music preferences change by season"""
        pipeline = [
            {
                "$project": {
                    "timestamp": 1,
                    "track": 1,
                    "audio_features": 1,
                    "month": {"$month": "$timestamp"},
                    "season": {
                        "$switch": {
                            "branches": [
                                {"case": {"$in": ["$month", [12, 1, 2]]}, "then": "Winter"},
                                {"case": {"$in": ["$month", [3, 4, 5]]}, "then": "Spring"},
                                {"case": {"$in": ["$month", [6, 7, 8]]}, "then": "Summer"},
                                {"case": {"$in": ["$month", [9, 10, 11]]}, "then": "Fall"}
                            ],
                            "default": "Unknown"
                        }
                    }
                }
            },
            {
                "$group": {
                    "_id": "$season",
                    "track_count": {"$sum": 1},
                    "avg_energy": {"$avg": "$audio_features.energy"},
                    "avg_valence": {"$avg": "$audio_features.valence"},
                    "avg_danceability": {"$avg": "$audio_features.danceability"},
                    "top_artists": {"$addToSet": "$track.artist"}
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "track_count": 1,
                    "avg_energy": 1,
                    "avg_valence": 1,
                    "avg_danceability": 1,
                    "unique_artists": {"$size": "$top_artists"}
                }
            }
        ]
        
        return list(self.collection.aggregate(pipeline))
    
    def generate_comprehensive_report(self):
        """Generate a comprehensive analytics report"""
        print("=" * 80)
        print("ECHOTUNE AI - ADVANCED DATA ANALYTICS REPORT")
        print("=" * 80)
        print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print()
        
        # Basic statistics
        total_docs = self.collection.count_documents({})
        unique_tracks = len(self.collection.distinct("spotify_track_uri"))
        unique_artists = len(self.collection.distinct("track.artist"))
        date_range = list(self.collection.aggregate([
            {"$group": {
                "_id": None,
                "min_date": {"$min": "$timestamp"},
                "max_date": {"$max": "$timestamp"},
                "total_time": {"$sum": "$listening.ms_played"}
            }}
        ]))[0]
        
        print("📊 DATASET OVERVIEW")
        print("-" * 40)
        print(f"Total listening records: {total_docs:,}")
        print(f"Unique tracks: {unique_tracks:,}")
        print(f"Unique artists: {unique_artists:,}")
        print(f"Date range: {date_range['min_date']} to {date_range['max_date']}")
        print(f"Total listening time: {date_range['total_time'] / 3600000:.0f} hours")
        print()
        
        # Listening patterns
        print("🕐 LISTENING PATTERNS BY TIME")
        print("-" * 40)
        patterns = self.get_listening_patterns()
        day_names = ["", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        
        # Find peak listening times
        peak_times = sorted(patterns, key=lambda x: x['listening_sessions'], reverse=True)[:5]
        print("Top 5 listening times:")
        for i, time_slot in enumerate(peak_times, 1):
            day = day_names[time_slot['_id']['dayOfWeek']]
            hour = time_slot['_id']['hour']
            sessions = time_slot['listening_sessions']
            print(f"  {i}. {day} at {hour:02d}:00 - {sessions:,} listening sessions")
        print()
        
        # Music discovery timeline
        print("🎵 MUSIC DISCOVERY TIMELINE")
        print("-" * 40)
        discovery = self.get_music_discovery_timeline()
        if discovery:
            print("Recent discovery trends (last 5 periods):")
            for period in discovery[-5:]:
                year, month = period['_id']['year'], period['_id']['month']
                tracks = period['new_tracks_discovered']
                artists = period['new_artists_discovered']
                hours = period['total_listening_hours']
                print(f"  {year}-{month:02d}: {tracks:,} new tracks, {artists:,} new artists, {hours:.0f}h listening")
        print()
        
        # Skip behavior
        print("⏭️  SKIP BEHAVIOR ANALYSIS")
        print("-" * 40)
        skip_analysis = self.get_skip_behavior_analysis()
        if skip_analysis:
            for bucket in skip_analysis:
                if bucket['_id'] != 'other':
                    completion_range = f"{bucket['_id']:.0%}"
                    count = bucket['count']
                    avg_time = bucket['avg_play_time'] / 1000  # Convert to seconds
                    print(f"  Completion ~{completion_range}: {count:,} tracks (avg {avg_time:.0f}s played)")
        print()
        
        # Audio features evolution
        print("🎶 AUDIO PREFERENCES EVOLUTION")
        print("-" * 40)
        audio_evolution = self.get_audio_features_analysis()
        if audio_evolution and len(audio_evolution) >= 2:
            recent = audio_evolution[-1]
            previous = audio_evolution[-2] if len(audio_evolution) > 1 else audio_evolution[0]
            
            print(f"Music taste evolution ({previous['_id']} → {recent['_id']}):")
            if recent.get('avg_energy') and previous.get('avg_energy'):
                energy_change = recent['avg_energy'] - previous['avg_energy']
                print(f"  Energy: {energy_change:+.2f} ({'more energetic' if energy_change > 0 else 'mellower'})")
            if recent.get('avg_valence') and previous.get('avg_valence'):
                valence_change = recent['avg_valence'] - previous['avg_valence']
                print(f"  Mood: {valence_change:+.2f} ({'more positive' if valence_change > 0 else 'more melancholic'})")
            if recent.get('avg_danceability') and previous.get('avg_danceability'):
                dance_change = recent['avg_danceability'] - previous['avg_danceability']
                print(f"  Danceability: {dance_change:+.2f} ({'more danceable' if dance_change > 0 else 'less danceable'})")
        print()
        
        # Seasonal preferences
        print("🌞 SEASONAL MUSIC PREFERENCES")
        print("-" * 40)
        seasonal = self.get_seasonal_preferences()
        for season_data in sorted(seasonal, key=lambda x: x['track_count'], reverse=True):
            season = season_data['_id']
            count = season_data['track_count']
            energy = season_data.get('avg_energy', 0)
            valence = season_data.get('avg_valence', 0)
            print(f"  {season}: {count:,} tracks (Energy: {energy:.2f}, Mood: {valence:.2f})")
        print()
        
        # Top artists evolution
        print("👑 TOP ARTISTS EVOLUTION")
        print("-" * 40)
        artists_evolution = self.get_top_artists_evolution(5)
        if artists_evolution:
            recent_year = artists_evolution[-1]
            print(f"Current top artists ({recent_year['_id']}):")
            for i, artist in enumerate(recent_year['top_artists'][:5], 1):
                name = artist['artist']
                plays = artist['play_count']
                hours = artist['total_time'] / 3600000
                print(f"  {i}. {name}: {plays:,} plays ({hours:.1f}h)")
        print()
        
        print("🚀 RECOMMENDATIONS FOR ML MODELS")
        print("-" * 40)
        print("• Use listening patterns for time-aware recommendations")
        print("• Leverage skip behavior for implicit feedback training")
        print("• Apply audio features for content-based filtering")
        print("• Incorporate seasonal preferences for contextual recommendations")
        print("• Track artist evolution for discovering new music preferences")
        print()
        
        print("=" * 80)
        print("Advanced analytics complete. Data ready for machine learning pipelines.")
        print("=" * 80)
    
    def disconnect(self):
        """Close MongoDB connection"""
        self.migrator.disconnect()

def main():
    """Run advanced data analysis"""
    try:
        analyzer = AdvancedDataAnalyzer()
        analyzer.generate_comprehensive_report()
        analyzer.disconnect()
    except Exception as e:
        print(f"Error during analysis: {e}")
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())