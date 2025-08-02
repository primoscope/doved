/**
 * Tests for enhanced Conversation Manager
 */

const ConversationManager = require('../../src/chat/conversation-manager');

// Mock MongoDB
jest.mock('../../src/database/mongodb', () => ({
  getDb: jest.fn(() => ({
    collection: jest.fn(() => ({
      findOne: jest.fn(),
      find: jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn(() => Promise.resolve([]))
      })),
      insertOne: jest.fn(),
      updateOne: jest.fn()
    }))
  }))
}));

describe('Enhanced ConversationManager', () => {
  let conversationManager;

  beforeEach(() => {
    conversationManager = new ConversationManager();
    jest.clearAllMocks();
  });

  describe('Entity Extraction', () => {
    test('should extract music genres from text', () => {
      const text = "I love rock music and electronic beats";
      const entities = conversationManager.extractMusicEntities(text);
      
      expect(entities.genres).toContain('rock');
      expect(entities.genres).toContain('electronic');
    });

    test('should extract mood indicators', () => {
      const text = "I'm feeling happy and energetic today";
      const entities = conversationManager.extractMusicEntities(text);
      
      expect(entities.moods).toContain('happy');
      expect(entities.moods).toContain('energetic');
    });

    test('should extract activity indicators', () => {
      const text = "Music for working out and studying";
      const entities = conversationManager.extractMusicEntities(text);
      
      expect(entities.activities).toContain('working out');
      expect(entities.activities).toContain('studying');
    });
  });

  describe('Intent Detection', () => {
    test('should detect recommendation intent', () => {
      const intent = conversationManager.detectUserIntent('Can you recommend some songs?', 'user');
      expect(intent).toBe('recommend');
    });

    test('should detect playlist creation intent', () => {
      const intent = conversationManager.detectUserIntent('Create a playlist for me', 'user');
      expect(intent).toBe('create_playlist');
    });

    test('should detect mood-based intent', () => {
      const intent = conversationManager.detectUserIntent("I'm feeling sad", 'user');
      expect(intent).toBe('mood_based');
    });

    test('should return null for assistant messages', () => {
      const intent = conversationManager.detectUserIntent('Here are some recommendations', 'assistant');
      expect(intent).toBeNull();
    });
  });

  describe('Mood Detection', () => {
    test('should detect happy mood', () => {
      const mood = conversationManager.detectMood('I am feeling happy and joyful');
      expect(mood).toBe('happy');
    });

    test('should detect calm mood', () => {
      const mood = conversationManager.detectMood('I want something peaceful and relaxed');
      expect(mood).toBe('calm');
    });

    test('should return null for no mood indicators', () => {
      const mood = conversationManager.detectMood('What is the weather like?');
      expect(mood).toBeNull();
    });
  });

  describe('Session Management', () => {
    test('should create session with enhanced context', async () => {
      const session = await conversationManager.startSession('user123', {
        context: { testContext: 'value' }
      });

      expect(session.sessionId).toBeDefined();
      expect(session.userId).toBe('user123');
      expect(session.context.musicContext).toBeDefined();
      expect(session.context.sessionMemory).toBeDefined();
    });

    test('should generate contextual hints', () => {
      // Create a mock session
      const mockSession = {
        context: {
          userIntent: 'recommend',
          musicContext: {
            currentMood: 'happy',
            recentlyDiscussed: ['rock', 'electronic']
          }
        }
      };

      conversationManager.activeSessions.set('test123', mockSession);
      
      const hints = conversationManager.getContextualHints('test123');
      expect(hints.length).toBeGreaterThan(0);
      expect(hints.some(hint => hint.includes('happy'))).toBe(true);
    });
  });

  describe('Conversation Summary', () => {
    test('should generate conversation summary', () => {
      const messages = [
        { role: 'user', content: 'I love rock music and indie bands' },
        { role: 'assistant', content: 'I recommend these rock albums for you' },
        { role: 'user', content: 'I prefer upbeat songs for working out' }
      ];

      const context = { userIntent: 'recommend' };
      const summary = conversationManager.generateConversationSummary(messages, context);

      expect(summary.messageCount).toBe(3);
      expect(summary.topics).toContain('rock');
      expect(summary.topics).toContain('indie');
      expect(summary.mainIntent).toBe('recommend');
    });
  });

  describe('Enhanced System Message', () => {
    test('should build comprehensive system message', () => {
      const mockSession = {
        context: {
          userProfile: { display_name: 'Test User' },
          userIntent: 'recommend',
          musicContext: {
            currentMood: 'energetic',
            recentlyDiscussed: ['rock', 'electronic']
          },
          conversationSummary: {
            topics: ['pop', 'rock'],
            userPreferences: ['I love upbeat music']
          }
        }
      };

      const systemMessage = conversationManager.buildSystemMessage(mockSession);
      
      expect(systemMessage.role).toBe('system');
      expect(systemMessage.content).toContain('Test User');
      expect(systemMessage.content).toContain('energetic');
      expect(systemMessage.content).toContain('rock, electronic');
      expect(systemMessage.content).toContain('pop, rock');
    });
  });
});