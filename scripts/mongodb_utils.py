#!/usr/bin/env python3
"""
Shared utilities for MongoDB operations in EchoTune AI
Contains common data structures and helper functions for MongoDB scripts
"""

from datetime import datetime, timezone
from typing import Dict, Any


def get_sample_listening_history_document() -> Dict[str, Any]:
    """
    Returns a sample document structure for listening history collection.
    This ensures consistent schema across all MongoDB scripts.
    """
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


def get_sample_document_json_structure() -> str:
    """
    Returns a formatted JSON string representation of the sample document structure.
    Useful for documentation and display purposes.
    """
    return """{
  "_id": "unique_identifier",
  "spotify_track_uri": "spotify:track:...",
  "timestamp": "2010-05-03 09:14:32",
  "user": {
    "username": "user_name",
    "platform": "platform_info",
    "country": "country_code"
  },
  "track": {
    "name": "Track Name",
    "artist": "Artist Name",
    "album": "Album Name",
    "duration_ms": 210000,
    "popularity": 75
  },
  "listening": {
    "ms_played": 180000,
    "skipped": false,
    "completion_rate": 0.857
  },
  "audio_features": {
    "danceability": 0.7,
    "energy": 0.8,
    "valence": 0.6,
    "tempo": 120.0
  },
  "metadata": {
    "explicit": false,
    "created_at": "timestamp"
  }
}"""