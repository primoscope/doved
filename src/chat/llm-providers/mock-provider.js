const BaseLLMProvider = require('./base-provider');

/**
 * Mock LLM Provider for Demo/Testing
 * Provides realistic music assistant responses without requiring API keys
 */
class MockLLMProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'mock';
    this.defaultModel = 'mock-music-assistant';
    this.responses = [
      'I\'d love to help you discover new music! What kind of mood are you in today? Are you looking for something upbeat and energetic, or perhaps something more mellow and relaxing?',
      'Great choice! Based on your preferences, I can recommend some fantastic tracks. What genre or activity would you like music for?',
      'I can help you create the perfect playlist! Tell me about the vibe you\'re going for - is this for working out, studying, a road trip, or just chilling at home?',
      'Music discovery is my specialty! I can analyze audio features like energy, danceability, and mood to find tracks that perfectly match what you\'re looking for.',
      'That\'s an interesting request! Let me think about some songs that would fit that description. Do you have any favorite artists or genres I should consider?',
      'I love helping people explore new music! Based on what you\'ve told me, I have some great suggestions that I think you\'ll enjoy.',
      'Music has such a powerful effect on our mood and energy! What kind of atmosphere are you trying to create with your music today?'
    ];
    this.musicResponses = {
      workout: 'For your workout playlist, I recommend high-energy tracks with strong beats! Try artists like **The Weeknd**, **Dua Lipa**, **Eminem**, or some classic rock anthems like **AC/DC** and **Queen**. Look for songs with:\n• **High energy** (0.7-1.0) and **danceability** (0.6-1.0)\n• **Tempo** around 120-140 BPM\n• **Genres**: Pop, Hip-Hop, Rock, Electronic Dance\n\n*🎵 Perfect tracks: "Blinding Lights", "Don\'t Start Now", "Till I Collapse"*',
      
      study: 'Perfect study music should enhance focus without being distracting! I\'d suggest:\n• **Lo-fi hip hop** playlists for consistent, non-intrusive beats\n• **Ambient electronic** like **Tycho**, **Boards of Canada**\n• **Instrumental post-rock** like **Explosions in the Sky**\n• **Modern classical** like **Ólafur Arnalds**, **Max Richter**\n\nLook for tracks with:\n• **High instrumentalness** (0.7-1.0)\n• **Low speechiness** (0.0-0.3)\n• **Moderate acousticness** (0.4-0.8)\n\n*🎵 Perfect albums: "Dive" by Tycho, "Sleep" by Max Richter*',
      
      chill: 'For the perfect chill vibe, I recommend tracks that are emotionally resonant but relaxed:\n• **Indie folk** like **Bon Iver**, **The Paper Kites**\n• **Alternative R&B** like **Billie Eilish**, **The Weeknd** (slower tracks)\n• **Dream pop** like **Beach House**, **Cigarettes After Sex**\n• **Acoustic sessions** of your favorite artists\n\nLook for songs with:\n• **Lower energy** (0.2-0.6) but good **emotional resonance**\n• **Higher acousticness** (0.5-0.9)\n• **Moderate valence** (0.3-0.7)\n\n*🎵 Perfect tracks: "Holocene", "Ocean Eyes", "Space Song"*',
      
      party: 'Party music needs **high danceability** and **infectious energy**! Perfect for getting everyone moving:\n• **Current pop hits** like **Doja Cat**, **Harry Styles**, **Olivia Rodrigo**\n• **Classic dance** like **Daft Punk**, **Calvin Harris**\n• **Upbeat hip-hop** like **Drake**, **Megan Thee Stallion**\n• **Feel-good throwbacks** like **Bruno Mars**, **Mark Ronson**\n\nLook for tracks with:\n• **High danceability** (0.7-1.0) and **energy** (0.6-1.0)\n• **Positive valence** (0.6-1.0)\n• **Tempo** 100-130 BPM\n\n*🎵 Perfect tracks: "As It Was", "About Damn Time", "Uptown Funk"*',
      
      road: 'Road trip music should be **engaging** and **sing-along worthy**! Mix of energy levels to match the journey:\n• **Classic rock anthems** like **Queen**, **Journey**, **Fleetwood Mac**\n• **Modern pop-rock** like **OneRepublic**, **Imagine Dragons**\n• **Feel-good indie** like **Foster the People**, **MGMT**\n• **Country hits** like **Keith Urban**, **Maren Morris**\n\nCreate a journey arc:\n• **Start energetic** (0.7+ energy) to build excitement\n• **Mix in nostalgic favorites** (varied decades)\n• **Include sing-alongs** with memorable choruses\n\n*🎵 Perfect tracks: "Don\'t Stop Believin\'", "Mr. Brightside", "Life is a Highway"*',
      
      sleep: 'For restful sleep, focus on **calming** and **low-energy** tracks:\n• **Ambient music** like **Brian Eno**, **Stars of the Lid**\n• **Soft acoustic** like **Iron & Wine**, **Nick Drake**\n• **Modern classical** like **Kiasmos**, **Nils Frahm**\n• **Nature sounds** mixed with gentle melodies\n\nLook for tracks with:\n• **Very low energy** (0.0-0.3)\n• **High acousticness** (0.7-1.0)\n• **Low loudness** (-20 to -10 dB)\n• **Minimal vocals** or instrumental\n\n*🎵 Perfect albums: "Ambient 1: Music for Airports", "Pink Moon"*',
      
      focus: 'Focus music should provide **mental clarity** without distraction:\n• **Minimalist classical** like **Steve Reich**, **Philip Glass**\n• **Ambient techno** like **Burial**, **Jon Hopkins**\n• **Instrumental jazz** like **GoGo Penguin**, **Mammal Hands**\n• **Mathematical music** like **Autechre** (if you enjoy complexity)\n\nOptimal characteristics:\n• **Repetitive patterns** that don\'t demand attention\n• **Consistent energy** levels (0.4-0.7)\n• **Minimal dynamic range**\n• **No sudden changes** in tempo or volume\n\n*🎵 Perfect tracks: "Music for Airports", "Immunity", "Prayer"*'
    };
  }

  async initialize() {
    // Mock provider is always ready
    this.isInitialized = true;
    console.log('✅ Mock LLM provider initialized - Demo mode active');
  }

  validateConfig() {
    // Mock provider doesn't need real configuration
    return true;
  }

  isAvailable() {
    return true; // Always available
  }

  getCapabilities() {
    return {
      streaming: true,
      functionCalling: false,
      maxTokens: 4096,
      supportedModels: ['mock-music-assistant'],
      features: ['chat', 'music_recommendations', 'demo_mode']
    };
  }

  async generateCompletion(messages) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    const lastMessage = messages[messages.length - 1];
    const userMessage = lastMessage?.content?.toLowerCase() || '';
    
    let response = this.generateMusicResponse(userMessage);

    return {
      content: response,
      role: 'assistant',
      model: this.defaultModel,
      usage: {
        promptTokens: this.estimateTokens(messages.map(m => m.content).join(' ')),
        completionTokens: this.estimateTokens(response),
        totalTokens: this.estimateTokens(messages.map(m => m.content).join(' ') + response)
      },
      metadata: {
        provider: 'mock',
        demoMode: true
      }
    };
  }

  async* generateStreamingCompletion(messages) {
    const lastMessage = messages[messages.length - 1];
    const userMessage = lastMessage?.content?.toLowerCase() || '';
    
    const response = this.generateMusicResponse(userMessage);
    const words = response.split(' ');
    
    // Stream words with realistic timing
    for (let i = 0; i < words.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      
      const chunk = words[i] + (i < words.length - 1 ? ' ' : '');
      yield {
        content: chunk,
        role: 'assistant',
        model: this.defaultModel,
        isPartial: i < words.length - 1
      };
    }
  }

  generateMusicResponse(userMessage) {
    const matchedCategory = this._findMessageCategory(userMessage);
    return this._getResponseForCategory(matchedCategory);
  }

  /**
   * Find the category that best matches the user message
   */
  _findMessageCategory(userMessage) {
    const keywordCategories = {
      workout: ['workout', 'exercise', 'gym'],
      study: ['study', 'focus', 'concentration'],
      chill: ['chill', 'relax', 'calm'],
      party: ['party', 'dance', 'celebration'],
      road: ['road trip', 'driving', 'travel'],
      playlist: ['playlist'],
      recommend: ['recommend', 'suggest', 'music'],
      analyze: ['analyze', 'habits', 'taste'],
      greeting: ['hello', 'hi', 'hey'],
      help: ['help', 'what can you do']
    };

    for (const [category, keywords] of Object.entries(keywordCategories)) {
      if (keywords.some(keyword => userMessage.includes(keyword))) {
        return category;
      }
    }

    return 'default';
  }

  /**
   * Get the appropriate response for a message category
   */
  _getResponseForCategory(category) {
    const responses = {
      workout: this.musicResponses.workout,
      study: this.musicResponses.study,
      chill: this.musicResponses.chill,
      party: this.musicResponses.party,
      road: this.musicResponses.road,
      playlist: 'I\'d be happy to help you create a playlist! To make the perfect one, I need to know more about what you\'re looking for. What\'s the occasion? Are you thinking about:\n\n• A specific mood (happy, relaxed, energetic)?\n• An activity (working out, studying, driving)?\n• A genre preference?\n• A particular time of day?\n\nOnce I know more, I can suggest tracks with the right energy, tempo, and vibe for your needs!',
      recommend: 'I\'d love to recommend some music for you! To give you the best suggestions, tell me:\n\n🎵 **What\'s your current mood?** (happy, chill, energetic, contemplative)\n🎯 **What\'s the setting?** (work, exercise, relaxation, social)\n🎨 **Any genre preferences?** (or open to anything!)\n\nI can analyze audio features like energy, danceability, and valence to find tracks that perfectly match what you\'re looking for. What sounds good to you?',
      analyze: '🎵 **Your Music DNA Analysis** 🎵\n\nWhile this is demo mode, here\'s what I could discover about your musical taste with your Spotify data:\n\n📊 **Listening Patterns Analysis:**\n• **Top Genres**: Pop (32%), Rock (28%), Electronic (18%), Indie (12%), Hip-Hop (10%)\n• **Peak Listening**: Evenings (7-9 PM) and weekend mornings\n• **Mood Distribution**: 60% upbeat, 25% chill, 15% melancholic\n• **Discovery Rate**: 23% new music, 77% familiar tracks\n\n🎯 **Audio Feature Profile:**\n• **Energy Level**: 0.72 (High-energy music lover!)\n• **Danceability**: 0.68 (You love to move to the beat)\n• **Valence**: 0.61 (Generally positive music preference)\n• **Acousticness**: 0.31 (Preference for produced/electronic sounds)\n\n📈 **Listening Evolution:**\n• **Morning**: Energetic pop and electronic (0.8 energy)\n• **Afternoon**: Focused indie and alternative (0.5 energy)\n• **Evening**: Mix of everything with social playlists\n• **Night**: Chill and acoustic for wind-down (0.3 energy)\n\n🎨 **Unique Insights:**\n• You have **excellent genre diversity** - more varied than 78% of users\n• **Seasonal listener**: Summer = dance/pop, Winter = indie/alternative\n• **Social influencer**: Your playlists often get shared by friends\n• **Discovery sweet spot**: Thursday evenings for new music\n\n🔮 **Predictions Based on Your Taste:**\n• You\'d probably love: **Glass Animals**, **ODESZA**, **Tame Impala**\n• Next genre to explore: **Synthwave** or **Future Funk**\n• Perfect concert for you: **Electronic music festival** in summer\n\n*Connect your Spotify account for your real musical DNA analysis! 🧬*',
      greeting: 'Hello! 🎵 I\'m **EchoTune AI**, your personal music discovery assistant! I\'m powered by advanced AI and connected to Spotify\'s vast music library.\n\n**🎯 What I can help you with:**\n• 🎵 **Smart Music Discovery** - Find new songs based on mood, activity, or vibes\n• 📝 **Custom Playlist Creation** - Build perfect playlists for any occasion  \n• 📊 **Music Taste Analysis** - Deep insights into your listening patterns\n• 🎨 **Mood-Based Suggestions** - Music that matches your current feelings\n• 🔍 **Artist & Genre Exploration** - Discover your next favorite artist\n• 🎮 **Interactive Music Games** - Fun ways to explore music\n\n**🚀 Ready-to-try examples:**\n• *"Create a high-energy workout playlist"*\n• *"Find me some chill study music"*\n• *"What would I like if I love Billie Eilish?"*\n• *"Analyze my music taste"*\n• *"Suggest something for a road trip"*\n\n**🎭 Demo Mode Features:**\nI\'m running in demo mode right now, which means I can:\n• Give detailed music recommendations and explanations\n• Create playlist concepts and suggest artists\n• Provide rich analysis of music characteristics\n• Explain audio features and music theory\n\n*💡 **Pro Tip**: Connect your Spotify account to unlock personalized recommendations based on your actual listening history!*\n\n**What kind of musical adventure shall we start today?** 🎶',
      help: '🎵 **EchoTune AI - Your Music Assistant**\n\nI\'m designed to be your personal music curator! Here\'s what I can help you with:\n\n**🎯 Music Discovery:**\n• Get recommendations based on mood, activity, or genre\n• Discover new artists similar to your favorites\n• Find perfect songs for any occasion\n\n**📝 Playlist Creation:**\n• Build custom playlists for workouts, study, parties, etc.\n• Mix familiar favorites with new discoveries\n• Balance energy levels and moods perfectly\n\n**📊 Music Analysis:**\n• Understand your listening patterns and preferences\n• Get insights into your musical evolution\n• Explore audio features like energy, danceability, and mood\n\n**🔧 Smart Features:**\n• Context-aware suggestions (time of day, weather, activity)\n• Audio feature analysis for precise matching\n• Integration with your Spotify library\n\nJust tell me what you\'re in the mood for, and I\'ll help you find the perfect soundtrack!'
    };

    if (responses[category]) {
      return responses[category];
    }

    // Default response for unrecognized categories
    const randomResponse = this.responses[Math.floor(Math.random() * this.responses.length)];
    return randomResponse + '\n\n*This is demo mode - connect your Spotify account for personalized recommendations based on your actual listening history!*';
  }

  handleError(error) {
    console.error('Mock provider error:', error);
    return {
      error: false, // Mock provider shouldn't fail
      content: 'I\'m having a small hiccup, but I\'m still here to help! What kind of music are you interested in exploring today?',
      metadata: { provider: 'mock', recovered: true }
    };
  }

  /**
   * Legacy generateResponse method for compatibility
   * @param {string} prompt - User message
   * @returns {Promise<string>} Response text
   */
  async generateResponse(prompt) {
    const messages = [{ role: 'user', content: prompt }];
    const completion = await this.generateCompletion(messages);
    return completion.content;
  }
}

module.exports = MockLLMProvider;