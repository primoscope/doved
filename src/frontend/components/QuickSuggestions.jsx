// React is needed for JSX


function QuickSuggestions({ onSuggestionClick }) {
  const suggestions = [
    { icon: '🏃‍♂️', text: 'Recommend workout music', category: 'activity' },
    { icon: '📚', text: 'Create study playlist', category: 'activity' },
    { icon: '🚗', text: 'Suggest road trip songs', category: 'activity' },
    { icon: '📊', text: 'Analyze my music taste', category: 'analysis' },
    { icon: '🌙', text: 'Find chill nighttime music', category: 'mood' },
    { icon: '☀️', text: 'Upbeat morning songs', category: 'mood' },
    { icon: '🎭', text: 'Music for different moods', category: 'mood' },
    { icon: '🔍', text: 'Discover new artists', category: 'discovery' }
  ];

  return (
    <div className="quick-suggestions">
      {suggestions.map((suggestion, index) => (
        <SuggestionChip
          key={index}
          icon={suggestion.icon}
          text={suggestion.text}
          category={suggestion.category}
          onClick={() => onSuggestionClick(suggestion.text)}
        />
      ))}
    </div>
  );
}

function SuggestionChip({ icon, text, category, onClick }) {
  return (
    <button
      className={`suggestion-chip ${category}`}
      onClick={onClick}
      type="button"
    >
      <span className="chip-icon">{icon}</span>
      <span className="chip-text">{text}</span>
    </button>
  );
}

export default QuickSuggestions;