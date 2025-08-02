// React is needed for JSX

import { useLLM } from '../contexts/LLMContext';

function ProviderPanel() {
  const { 
    currentProvider, 
    providers, 
    loading, 
    switchProvider, 
    refreshProviders 
  } = useLLM();

  const handleProviderChange = async (e) => {
    const newProvider = e.target.value;
    if (newProvider === currentProvider) return;

    const success = await switchProvider(newProvider);
    if (!success) {
      // Revert selection if switch failed
      e.target.value = currentProvider;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected': return 'var(--success-color)';
      case 'error': return 'var(--error-color)';
      case 'unknown': return 'var(--warning-color)';
      default: return 'var(--text-secondary)';
    }
  };

  const getStatusText = (providerId) => {
    const provider = providers[providerId];
    if (!provider) return 'Unknown';
    
    if (loading) return 'Loading...';
    if (!provider.available) return 'Unavailable';
    if (provider.status === 'connected') return 'Ready';
    if (provider.status === 'error') return 'Error';
    return 'Unknown';
  };

  return (
    <div className="provider-panel">
      <div className="provider-controls">
        <label htmlFor="provider-select" className="provider-label">
          🤖 AI Provider:
        </label>
        
        <select 
          id="provider-select" 
          className="provider-select"
          value={currentProvider}
          onChange={handleProviderChange}
          disabled={loading}
        >
          {Object.entries(providers)
            .sort(([a], [b]) => {
              // Sort to prioritize Gemini first, then others, with mock last
              const order = ['gemini', 'openai', 'azure', 'openrouter', 'mock'];
              return order.indexOf(a) - order.indexOf(b);
            })
            .map(([key, provider]) => (
            <option 
              key={key} 
              value={key}
              disabled={!provider.available}
            >
              {provider.name} {!provider.available ? '(Unavailable)' : ''}
            </option>
          ))}
        </select>
        
        <button 
          className="provider-settings-btn"
          onClick={() => alert('Provider settings will be implemented in settings page')}
          title="Provider Settings"
          disabled={loading}
        >
          ⚙️
        </button>
        
        <button 
          className="refresh-providers-btn"
          onClick={refreshProviders}
          title="Refresh Providers"
          disabled={loading}
        >
          {loading ? '⟳' : '🔄'}
        </button>
      </div>
      
      <div className="provider-status">
        <span 
          className="status-text"
          style={{ color: getStatusColor(providers[currentProvider]?.status) }}
        >
          {getStatusText(currentProvider)}
        </span>
        {providers[currentProvider]?.model && (
          <span className="model-info">
            ({providers[currentProvider].model})
          </span>
        )}
      </div>
    </div>
  );
}

export default ProviderPanel;