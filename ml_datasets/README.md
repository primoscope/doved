# EchoTune AI - ML Datasets

Generated on: 2025-07-31 20:51:24 UTC

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
