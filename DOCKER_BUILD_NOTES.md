# EchoTune AI - Docker Build Notes

## Production Build
The Dockerfile now uses `requirements-production.txt` which includes only the essential dependencies needed for the core application to run. This avoids complex scientific package compilation issues in Alpine Linux.

## Development/Analysis Dependencies
The full `requirements.txt` contains heavy ML and data analysis packages that may be needed for development and data analysis scripts. To install these in a development environment:

### Option 1: Install in development virtual environment (Recommended)
```bash
# Create development virtual environment
python3 -m venv dev-venv
source dev-venv/bin/activate
pip install -r requirements.txt
```

### Option 2: Use multi-stage Docker build for development
For development that requires the full package set, consider using a different base image:

```dockerfile
# Use python:3.11-slim instead of alpine for easier package compilation
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install all requirements
RUN pip install -r requirements.txt
```

### Option 3: Install additional packages at runtime
For occasional use of ML packages in production:
```bash
docker exec -it <container> /app/venv/bin/pip install scikit-learn matplotlib
```

## What's included in production build:
- Core data processing (pandas, numpy via Alpine packages)
- Spotify API integration (spotipy)
- Web frameworks (FastAPI, aiohttp)
- Database connectors (SQLAlchemy, PyMongo, psycopg2)
- MCP server dependencies
- Basic testing tools

## What's excluded from production build:
- Heavy ML packages (scikit-learn, scipy)
- Audio analysis (librosa)
- Data visualization (matplotlib, seaborn, plotly)
- Jupyter notebook support
- Development tools (black, isort, flake8, mypy)

These can be added on demand as needed.