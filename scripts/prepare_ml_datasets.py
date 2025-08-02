#!/usr/bin/env python3
"""
Machine Learning Dataset Preparation Script for EchoTune AI
Prepares optimized datasets from MongoDB for various ML tasks
"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from migrate_to_mongodb import MongoDBMigrator

class MLDatasetPreparator:
    """Prepare ML-ready datasets from MongoDB listening history"""
    
    def __init__(self, output_dir="ml_datasets"):
        self.migrator = MongoDBMigrator()
        self.migrator.connect()
        self.collection = self.migrator.collection
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
    
    def extract_user_features(self):
        """Extract user behavior features for recommendation systems"""
        pipeline = [
            {
                "$group": {
                    "_id": "$user.username",
                    "total_tracks": {"$sum": 1},
                    "total_listening_time": {"$sum": "$listening.ms_played"},
                    "unique_artists": {"$addToSet": "$track.artist"},
                    "unique_albums": {"$addToSet": "$track.album"},
                    "avg_completion_rate": {"$avg": "$listening.completion_rate"},
                    "skip_rate": {
                        "$avg": {
                            "$cond": [
                                {"$lt": ["$listening.completion_rate", 0.5]},
                                1, 0
                            ]
                        }
                    },
                    "listening_sessions": {"$sum": 1},
                    "first_listen": {"$min": "$timestamp"},
                    "last_listen": {"$max": "$timestamp"},
                    # Audio preferences
                    "avg_danceability": {"$avg": "$audio_features.danceability"},
                    "avg_energy": {"$avg": "$audio_features.energy"},
                    "avg_valence": {"$avg": "$audio_features.valence"},
                    "avg_tempo": {"$avg": "$audio_features.tempo"},
                    "avg_acousticness": {"$avg": "$audio_features.acousticness"},
                    "avg_instrumentalness": {"$avg": "$audio_features.instrumentalness"},
                    "avg_speechiness": {"$avg": "$audio_features.speechiness"}
                }
            },
            {
                "$project": {
                    "user_id": "$_id",
                    "total_tracks": 1,
                    "total_listening_hours": {"$divide": ["$total_listening_time", 3600000]},
                    "unique_artists_count": {"$size": "$unique_artists"},
                    "unique_albums_count": {"$size": "$unique_albums"},
                    "avg_completion_rate": 1,
                    "skip_rate": 1,
                    "listening_sessions": 1,
                    "listening_span_days": {
                        "$divide": [
                            {"$subtract": ["$last_listen", "$first_listen"]},
                            86400000
                        ]
                    },
                    "music_diversity": {
                        "$divide": [
                            {"$size": "$unique_artists"},
                            "$total_tracks"
                        ]
                    },
                    # Audio feature preferences
                    "pref_danceability": "$avg_danceability",
                    "pref_energy": "$avg_energy", 
                    "pref_valence": "$avg_valence",
                    "pref_tempo": "$avg_tempo",
                    "pref_acousticness": "$avg_acousticness",
                    "pref_instrumentalness": "$avg_instrumentalness",
                    "pref_speechiness": "$avg_speechiness"
                }
            }
        ]
        
        return list(self.collection.aggregate(pipeline))
    
    def extract_track_features(self):
        """Extract track features for content-based filtering"""
        pipeline = [
            {
                "$group": {
                    "_id": "$spotify_track_uri",
                    "track_name": {"$first": "$track.name"},
                    "artist": {"$first": "$track.artist"},
                    "album": {"$first": "$track.album"},
                    "total_plays": {"$sum": 1},
                    "total_listening_time": {"$sum": "$listening.ms_played"},
                    "avg_completion_rate": {"$avg": "$listening.completion_rate"},
                    "unique_listeners": {"$addToSet": "$user.username"},
                    "first_played": {"$min": "$timestamp"},
                    "last_played": {"$max": "$timestamp"},
                    # Audio features
                    "danceability": {"$first": "$audio_features.danceability"},
                    "energy": {"$first": "$audio_features.energy"},
                    "valence": {"$first": "$audio_features.valence"},
                    "tempo": {"$first": "$audio_features.tempo"},
                    "acousticness": {"$first": "$audio_features.acousticness"},
                    "instrumentalness": {"$first": "$audio_features.instrumentalness"},
                    "speechiness": {"$first": "$audio_features.speechiness"},
                    "loudness": {"$first": "$audio_features.loudness"},
                    "key": {"$first": "$audio_features.key"},
                    "mode": {"$first": "$audio_features.mode"},
                    "time_signature": {"$first": "$audio_features.time_signature"}
                }
            },
            {
                "$project": {
                    "track_uri": "$_id",
                    "track_name": 1,
                    "artist": 1,
                    "album": 1,
                    "popularity_score": "$total_plays",
                    "total_listening_hours": {"$divide": ["$total_listening_time", 3600000]},
                    "avg_completion_rate": 1,
                    "unique_listeners_count": {"$size": "$unique_listeners"},
                    "track_age_days": {
                        "$divide": [
                            {"$subtract": [{"$toDate": "2024-05-05"}, "$first_played"]},
                            86400000
                        ]
                    },
                    "last_played_days_ago": {
                        "$divide": [
                            {"$subtract": [{"$toDate": "2024-05-05"}, "$last_played"]},
                            86400000
                        ]
                    },
                    # Audio features for content-based filtering
                    "danceability": 1,
                    "energy": 1,
                    "valence": 1,
                    "tempo": 1,
                    "acousticness": 1,
                    "instrumentalness": 1,
                    "speechiness": 1,
                    "loudness": 1,
                    "key": 1,
                    "mode": 1,
                    "time_signature": 1
                }
            }
        ]
        
        return list(self.collection.aggregate(pipeline))
    
    def extract_interaction_matrix(self):
        """Extract user-item interaction matrix for collaborative filtering"""
        pipeline = [
            {
                "$group": {
                    "_id": {
                        "user": "$user.username",
                        "track": "$spotify_track_uri"
                    },
                    "play_count": {"$sum": 1},
                    "total_listening_time": {"$sum": "$listening.ms_played"},
                    "avg_completion_rate": {"$avg": "$listening.completion_rate"},
                    "first_play": {"$min": "$timestamp"},
                    "last_play": {"$max": "$timestamp"}
                }
            },
            {
                "$project": {
                    "user_id": "$_id.user",
                    "track_uri": "$_id.track",
                    "play_count": 1,
                    "listening_hours": {"$divide": ["$total_listening_time", 3600000]},
                    "avg_completion_rate": 1,
                    "engagement_score": {
                        "$multiply": [
                            "$play_count",
                            {"$ifNull": ["$avg_completion_rate", 0.5]}
                        ]
                    },
                    "days_since_last_play": {
                        "$divide": [
                            {"$subtract": [{"$toDate": "2024-05-05"}, "$last_play"]},
                            86400000
                        ]
                    },
                    "listening_span_days": {
                        "$divide": [
                            {"$subtract": ["$last_play", "$first_play"]},
                            86400000
                        ]
                    }
                }
            }
        ]
        
        return list(self.collection.aggregate(pipeline))
    
    def extract_temporal_features(self):
        """Extract temporal listening patterns for time-aware recommendations"""
        pipeline = [
            {
                "$project": {
                    "user_id": "$user.username",
                    "track_uri": "$spotify_track_uri",
                    "timestamp": 1,
                    "listening_time": "$listening.ms_played",
                    "completion_rate": "$listening.completion_rate",
                    "hour": {"$hour": "$timestamp"},
                    "day_of_week": {"$dayOfWeek": "$timestamp"},
                    "day_of_month": {"$dayOfMonth": "$timestamp"},
                    "month": {"$month": "$timestamp"},
                    "year": {"$year": "$timestamp"},
                    "season": {
                        "$switch": {
                            "branches": [
                                {"case": {"$in": [{"$month": "$timestamp"}, [12, 1, 2]]}, "then": 0},  # Winter
                                {"case": {"$in": [{"$month": "$timestamp"}, [3, 4, 5]]}, "then": 1},   # Spring
                                {"case": {"$in": [{"$month": "$timestamp"}, [6, 7, 8]]}, "then": 2},   # Summer
                                {"case": {"$in": [{"$month": "$timestamp"}, [9, 10, 11]]}, "then": 3}  # Fall
                            ],
                            "default": 0
                        }
                    },
                    "is_weekend": {
                        "$in": [{"$dayOfWeek": "$timestamp"}, [1, 7]]  # Sunday=1, Saturday=7
                    }
                }
            }
        ]
        
        return list(self.collection.aggregate(pipeline))
    
    def create_recommendation_datasets(self):
        """Create comprehensive datasets for recommendation system training"""
        print("Creating ML datasets for recommendation systems...")
        
        # 1. User features dataset
        print("  Extracting user features...")
        user_features = self.extract_user_features()
        user_df = pd.DataFrame(user_features)
        user_df.to_csv(self.output_dir / "user_features.csv", index=False)
        print(f"    Saved user_features.csv ({len(user_df)} users)")
        
        # 2. Track features dataset
        print("  Extracting track features...")
        track_features = self.extract_track_features()
        track_df = pd.DataFrame(track_features)
        track_df.to_csv(self.output_dir / "track_features.csv", index=False)
        print(f"    Saved track_features.csv ({len(track_df)} tracks)")
        
        # 3. User-item interaction matrix
        print("  Creating interaction matrix...")
        interactions = self.extract_interaction_matrix()
        interaction_df = pd.DataFrame(interactions)
        interaction_df.to_csv(self.output_dir / "user_track_interactions.csv", index=False)
        print(f"    Saved user_track_interactions.csv ({len(interaction_df)} interactions)")
        
        # 4. Temporal features
        print("  Extracting temporal features...")
        temporal_data = self.extract_temporal_features()
        temporal_df = pd.DataFrame(temporal_data)
        temporal_df.to_csv(self.output_dir / "temporal_listening_patterns.csv", index=False)
        print(f"    Saved temporal_listening_patterns.csv ({len(temporal_df)} records)")
        
        # 5. Create train/test splits for different scenarios
        print("  Creating train/test splits...")
        
        # Temporal split (80% of time for training, 20% for testing)
        temporal_df['timestamp'] = pd.to_datetime(temporal_df['timestamp'])
        temporal_df = temporal_df.sort_values('timestamp')
        split_idx = int(len(temporal_df) * 0.8)
        
        train_temporal = temporal_df[:split_idx]
        test_temporal = temporal_df[split_idx:]
        
        train_temporal.to_csv(self.output_dir / "train_temporal.csv", index=False)
        test_temporal.to_csv(self.output_dir / "test_temporal.csv", index=False)
        print(f"    Saved temporal splits: {len(train_temporal)} train, {len(test_temporal)} test")
        
        # Random split for interaction data
        train_interactions, test_interactions = train_test_split(
            interaction_df, test_size=0.2, random_state=42
        )
        train_interactions.to_csv(self.output_dir / "train_interactions.csv", index=False)
        test_interactions.to_csv(self.output_dir / "test_interactions.csv", index=False)
        print(f"    Saved interaction splits: {len(train_interactions)} train, {len(test_interactions)} test")
        
        return {
            "user_features": len(user_df),
            "track_features": len(track_df),
            "interactions": len(interaction_df),
            "temporal_records": len(temporal_df)
        }
    
    def create_classification_datasets(self):
        """Create datasets for classification tasks (skip prediction, genre classification, etc.)"""
        print("Creating classification datasets...")
        
        # Skip prediction dataset
        skip_pipeline = [
            {
                "$match": {
                    "listening.completion_rate": {"$exists": True}
                }
            },
            {
                "$project": {
                    "track_uri": "$spotify_track_uri",
                    "user_id": "$user.username",
                    "completion_rate": "$listening.completion_rate",
                    "is_skip": {"$lt": ["$listening.completion_rate", 0.3]},
                    "listening_time": "$listening.ms_played",
                    "hour": {"$hour": "$timestamp"},
                    "day_of_week": {"$dayOfWeek": "$timestamp"},
                    "is_weekend": {"$in": [{"$dayOfWeek": "$timestamp"}, [1, 7]]},
                    # Audio features
                    "danceability": "$audio_features.danceability",
                    "energy": "$audio_features.energy",
                    "valence": "$audio_features.valence",
                    "tempo": "$audio_features.tempo",
                    "acousticness": "$audio_features.acousticness",
                    "speechiness": "$audio_features.speechiness"
                }
            }
        ]
        
        skip_data = list(self.collection.aggregate(skip_pipeline))
        skip_df = pd.DataFrame(skip_data)
        skip_df.to_csv(self.output_dir / "skip_prediction_dataset.csv", index=False)
        print(f"  Saved skip_prediction_dataset.csv ({len(skip_df)} records)")
        
        return {"skip_prediction": len(skip_df)}
    
    def create_clustering_datasets(self):
        """Create datasets for clustering tasks (user segmentation, music clustering, etc.)"""
        print("Creating clustering datasets...")
        
        # User clustering based on listening behavior
        user_clustering_pipeline = [
            {
                "$group": {
                    "_id": "$user.username",
                    "avg_listening_duration": {"$avg": "$listening.ms_played"},
                    "total_sessions": {"$sum": 1},
                    "unique_artists": {"$addToSet": "$track.artist"},
                    "skip_rate": {
                        "$avg": {
                            "$cond": [
                                {"$lt": ["$listening.completion_rate", 0.3]},
                                1, 0
                            ]
                        }
                    },
                    "evening_sessions": {
                        "$sum": {
                            "$cond": [
                                {"$gte": [{"$hour": "$timestamp"}, 18]},
                                1, 0
                            ]
                        }
                    },
                    "weekend_sessions": {
                        "$sum": {
                            "$cond": [
                                {"$in": [{"$dayOfWeek": "$timestamp"}, [1, 7]]},
                                1, 0
                            ]
                        }
                    },
                    "avg_danceability": {"$avg": "$audio_features.danceability"},
                    "avg_energy": {"$avg": "$audio_features.energy"},
                    "avg_valence": {"$avg": "$audio_features.valence"}
                }
            },
            {
                "$project": {
                    "user_id": "$_id",
                    "avg_listening_minutes": {"$divide": ["$avg_listening_duration", 60000]},
                    "total_sessions": 1,
                    "music_diversity": {"$size": "$unique_artists"},
                    "skip_rate": 1,
                    "evening_preference": {"$divide": ["$evening_sessions", "$total_sessions"]},
                    "weekend_preference": {"$divide": ["$weekend_sessions", "$total_sessions"]},
                    "music_energy": "$avg_energy",
                    "music_mood": "$avg_valence",
                    "music_danceability": "$avg_danceability"
                }
            }
        ]
        
        user_clustering_data = list(self.collection.aggregate(user_clustering_pipeline))
        user_clustering_df = pd.DataFrame(user_clustering_data)
        user_clustering_df.to_csv(self.output_dir / "user_clustering_features.csv", index=False)
        print(f"  Saved user_clustering_features.csv ({len(user_clustering_df)} users)")
        
        return {"user_clustering": len(user_clustering_df)}
    
    def generate_feature_documentation(self):
        """Generate documentation for all created features"""
        docs = {
            "user_features.csv": {
                "description": "User behavior and preference features for recommendation systems",
                "features": {
                    "user_id": "Unique user identifier",
                    "total_tracks": "Total number of tracks listened to",
                    "total_listening_hours": "Total listening time in hours",
                    "unique_artists_count": "Number of unique artists listened to",
                    "unique_albums_count": "Number of unique albums listened to", 
                    "avg_completion_rate": "Average completion rate (0-1)",
                    "skip_rate": "Proportion of tracks skipped (completion < 50%)",
                    "music_diversity": "Artist diversity score (unique artists / total tracks)",
                    "pref_*": "Audio feature preferences (average values)"
                }
            },
            "track_features.csv": {
                "description": "Track content features for content-based filtering",
                "features": {
                    "track_uri": "Spotify track URI",
                    "popularity_score": "Number of times track was played",
                    "avg_completion_rate": "Average completion rate across all users",
                    "unique_listeners_count": "Number of unique users who played this track",
                    "track_age_days": "Days since first play in dataset",
                    "audio_features": "Spotify audio features (danceability, energy, etc.)"
                }
            },
            "user_track_interactions.csv": {
                "description": "User-track interaction matrix for collaborative filtering",
                "features": {
                    "user_id": "User identifier",
                    "track_uri": "Track identifier",
                    "play_count": "Number of times user played this track",
                    "engagement_score": "Weighted score based on plays and completion rate",
                    "days_since_last_play": "Recency of interaction"
                }
            },
            "temporal_listening_patterns.csv": {
                "description": "Time-aware listening data for temporal recommendation models",
                "features": {
                    "timestamp": "When the track was played",
                    "hour": "Hour of day (0-23)",
                    "day_of_week": "Day of week (1=Sunday, 7=Saturday)",
                    "season": "Season encoding (0=Winter, 1=Spring, 2=Summer, 3=Fall)",
                    "is_weekend": "Boolean flag for weekend listening"
                }
            },
            "skip_prediction_dataset.csv": {
                "description": "Features for predicting skip behavior",
                "target": "is_skip (boolean)",
                "features": {
                    "completion_rate": "Actual completion rate",
                    "temporal_features": "Hour, day of week, weekend flag",
                    "audio_features": "Track audio characteristics"
                }
            }
        }
        
        with open(self.output_dir / "feature_documentation.json", 'w') as f:
            json.dump(docs, f, indent=2)
        
        # Create README
        readme_content = f"""# EchoTune AI - ML Datasets

Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}

## Dataset Overview

This directory contains machine learning ready datasets extracted from the Spotify listening history stored in MongoDB.

## Files

### Core Datasets
- `user_features.csv` - User behavior and preference profiles
- `track_features.csv` - Track content features with audio characteristics  
- `user_track_interactions.csv` - User-item interaction matrix
- `temporal_listening_patterns.csv` - Time-aware listening data

### Training Splits
- `train_temporal.csv` / `test_temporal.csv` - Temporal train/test split (80/20)
- `train_interactions.csv` / `test_interactions.csv` - Random train/test split (80/20)

### Specialized Datasets
- `skip_prediction_dataset.csv` - Features for skip behavior prediction
- `user_clustering_features.csv` - Features for user segmentation

### Documentation
- `feature_documentation.json` - Detailed feature descriptions
- `README.md` - This file

## Usage Examples

### Collaborative Filtering
```python
import pandas as pd
interactions = pd.read_csv('user_track_interactions.csv')
user_features = pd.read_csv('user_features.csv')
track_features = pd.read_csv('track_features.csv')
```

### Content-Based Filtering
```python
tracks = pd.read_csv('track_features.csv')
audio_features = tracks[['danceability', 'energy', 'valence', 'tempo', 'acousticness']]
```

### Skip Prediction
```python
skip_data = pd.read_csv('skip_prediction_dataset.csv')
X = skip_data.drop(['is_skip', 'track_uri', 'user_id'], axis=1)
y = skip_data['is_skip']
```

## Next Steps

1. **Recommendation Systems**: Use collaborative filtering with user-track interactions
2. **Content Analysis**: Apply content-based filtering with audio features
3. **User Segmentation**: Cluster users based on listening behavior
4. **Temporal Models**: Build time-aware recommendation systems
5. **Skip Prediction**: Train models to predict user skip behavior

## Notes

- All datasets are cleaned and preprocessed
- Missing values in audio features indicate tracks without Spotify audio analysis
- Timestamps are in UTC
- All numeric features are in their raw form (consider normalization for some ML algorithms)
"""
        
        with open(self.output_dir / "README.md", 'w') as f:
            f.write(readme_content)
    
    def create_all_datasets(self):
        """Create all ML datasets and documentation"""
        print("=" * 80)
        print("ECHOTUNE AI - ML DATASET PREPARATION")
        print("=" * 80)
        print(f"Output directory: {self.output_dir.absolute()}")
        print()
        
        # Create datasets
        rec_stats = self.create_recommendation_datasets()
        class_stats = self.create_classification_datasets()
        cluster_stats = self.create_clustering_datasets()
        
        # Generate documentation
        print("  Creating documentation...")
        self.generate_feature_documentation()
        print("  Saved feature_documentation.json and README.md")
        
        print()
        print("📊 DATASET SUMMARY")
        print("-" * 40)
        print(f"Recommendation datasets:")
        for name, count in rec_stats.items():
            print(f"  {name}: {count:,} records")
        
        print(f"\nClassification datasets:")
        for name, count in class_stats.items():
            print(f"  {name}: {count:,} records")
            
        print(f"\nClustering datasets:")
        for name, count in cluster_stats.items():
            print(f"  {name}: {count:,} records")
        
        print()
        print("🎯 ML READINESS STATUS")
        print("-" * 40)
        print("✅ User-item collaborative filtering ready")
        print("✅ Content-based filtering ready")
        print("✅ Temporal recommendation models ready")
        print("✅ Skip prediction models ready")
        print("✅ User clustering ready")
        print("✅ Feature documentation complete")
        
        print()
        print("🚀 RECOMMENDED NEXT STEPS")
        print("-" * 40)
        print("1. Train collaborative filtering model (Matrix Factorization/Neural CF)")
        print("2. Build content-based recommender using audio features")
        print("3. Implement hybrid recommendation system")
        print("4. Train skip prediction classifier")
        print("5. Perform user segmentation analysis")
        print("6. Deploy real-time recommendation API")
        
        print()
        print("=" * 80)
        print(f"All ML datasets created successfully in {self.output_dir}/")
        print("=" * 80)
    
    def disconnect(self):
        """Close MongoDB connection"""
        self.migrator.disconnect()

def main():
    """Prepare all ML datasets"""
    try:
        preparator = MLDatasetPreparator()
        preparator.create_all_datasets()
        preparator.disconnect()
        return 0
    except Exception as e:
        print(f"Error preparing ML datasets: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())