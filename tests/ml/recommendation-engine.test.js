/**
 * Tests for ML Recommendation Engine
 */

const RecommendationEngine = require('../../src/ml/recommendation-engine');

describe('RecommendationEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new RecommendationEngine();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should create recommendation engine instance', () => {
      expect(engine).toBeInstanceOf(RecommendationEngine);
      expect(engine.weights).toBeDefined();
      expect(engine.collaborativeFilter).toBeDefined();
      expect(engine.contentFilter).toBeDefined();
    });

    test('should have default algorithm weights', () => {
      expect(engine.weights.content_based).toBeGreaterThan(0);
      expect(engine.weights.collaborative).toBeGreaterThan(0);
      expect(engine.weights.popularity).toBeGreaterThan(0);
    });
  });

  describe('diversity calculation', () => {
    test('should calculate diversity stats for recommendations', () => {
      const recommendations = [
        { genre: 'pop', artist: 'Artist A' },
        { genre: 'rock', artist: 'Artist B' },
        { genre: 'pop', artist: 'Artist C' }
      ];

      const stats = engine.calculateDiversityStats(recommendations);

      expect(stats).toHaveProperty('genre_diversity');
      expect(stats).toHaveProperty('artist_diversity');
      expect(typeof stats.genre_diversity).toBe('number');
      expect(typeof stats.artist_diversity).toBe('number');
    });

    test('should handle empty recommendations', () => {
      const stats = engine.calculateDiversityStats([]);
      
      expect(stats).toHaveProperty('genre_diversity');
      expect(stats).toHaveProperty('artist_diversity');
      expect(stats.genre_diversity).toBe(0);
      expect(stats.artist_diversity).toBe(0);
    });
  });

  describe('configuration', () => {
    test('should have proper content and collaborative filters', () => {
      expect(engine.contentFilter).toBeDefined();
      expect(engine.collaborativeFilter).toBeDefined();
      // Test that these are objects with expected structure
      expect(typeof engine.contentFilter).toBe('object');
      expect(typeof engine.collaborativeFilter).toBe('object');
    });
  });
});