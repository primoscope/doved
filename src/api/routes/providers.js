const express = require('express');
const { 
  getAllProviders, 
  getModelsForProvider, 
  searchModels, 
  getModel,
  validateProviderConfig,
  FEATURES,
  COST_LEVELS,
  SPEED_LEVELS
} = require('../../config/provider-models');

const router = express.Router();

/**
 * Get all available providers
 */
router.get('/providers', (req, res) => {
  try {
    const providers = getAllProviders();
    res.json({
      success: true,
      providers,
      total: providers.length
    });
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch providers'
    });
  }
});

/**
 * Get models for a specific provider
 */
router.get('/providers/:providerId/models', (req, res) => {
  try {
    const { providerId } = req.params;
    const { search, limit = 50, offset = 0 } = req.query;
    
    let models = getModelsForProvider(providerId);
    
    if (!models.length) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found or has no models'
      });
    }

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      models = models.filter(model => 
        model.name.toLowerCase().includes(searchLower) ||
        model.description.toLowerCase().includes(searchLower) ||
        model.id.toLowerCase().includes(searchLower)
      );
    }

    // Apply pagination
    const total = models.length;
    const paginatedModels = models.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );

    res.json({
      success: true,
      models: paginatedModels,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching provider models:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch provider models'
    });
  }
});

/**
 * Search models across all providers
 */
router.get('/models/search', (req, res) => {
  try {
    const { q: query, provider, limit = 50, offset = 0 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters long'
      });
    }

    let results = searchModels(query.trim(), provider);
    
    // Apply pagination
    const total = results.length;
    const paginatedResults = results.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );

    res.json({
      success: true,
      results: paginatedResults,
      query: query.trim(),
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error searching models:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search models'
    });
  }
});

/**
 * Get specific model details
 */
router.get('/providers/:providerId/models/:modelId', (req, res) => {
  try {
    const { providerId, modelId } = req.params;
    
    const model = getModel(providerId, modelId);
    
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'Model not found'
      });
    }

    res.json({
      success: true,
      model: {
        ...model,
        providerId,
        provider: getAllProviders().find(p => p.id === providerId)
      }
    });
  } catch (error) {
    console.error('Error fetching model details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch model details'
    });
  }
});

/**
 * Validate provider configuration
 */
router.post('/providers/:providerId/validate', (req, res) => {
  try {
    const { providerId } = req.params;
    const config = req.body;
    
    const validation = validateProviderConfig(providerId, config);
    
    res.json({
      success: true,
      validation
    });
  } catch (error) {
    console.error('Error validating provider config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate provider configuration'
    });
  }
});

/**
 * Get feature definitions
 */
router.get('/features', (req, res) => {
  try {
    res.json({
      success: true,
      features: FEATURES
    });
  } catch (error) {
    console.error('Error fetching features:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch features'
    });
  }
});

/**
 * Get cost and speed level definitions
 */
router.get('/levels', (req, res) => {
  try {
    res.json({
      success: true,
      cost: COST_LEVELS,
      speed: SPEED_LEVELS
    });
  } catch (error) {
    console.error('Error fetching levels:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch levels'
    });
  }
});

/**
 * Get comprehensive provider and model data for settings UI
 */
router.get('/settings-data', (req, res) => {
  try {
    const providers = getAllProviders();
    
    // Add model counts to providers
    const providersWithModelCounts = providers.map(provider => ({
      ...provider,
      modelCount: provider.models.length
    }));

    res.json({
      success: true,
      data: {
        providers: providersWithModelCounts,
        features: FEATURES,
        costLevels: COST_LEVELS,
        speedLevels: SPEED_LEVELS,
        totalModels: providers.reduce((sum, p) => sum + p.models.length, 0)
      }
    });
  } catch (error) {
    console.error('Error fetching settings data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settings data'
    });
  }
});

module.exports = router;