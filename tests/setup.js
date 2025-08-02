/**
 * Jest test setup for EchoTune AI
 * Provides global mocks and test utilities
 */

// Import OpenAI shims for Node.js environment (conditionally)
try {
  require('openai/shims/node');
} catch (e) {
  // OpenAI shims may not be available in all test environments
}

// Set test environment
process.env.NODE_ENV = 'test';

// Mock environment variables for testing
process.env.SPOTIFY_CLIENT_ID = 'test_client_id';
process.env.SPOTIFY_CLIENT_SECRET = 'test_client_secret';
process.env.OPENAI_API_KEY = 'test_openai_key';
process.env.GOOGLE_API_KEY = 'test_google_key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
process.env.DEFAULT_LLM_PROVIDER = 'mock';
process.env.LOG_LEVEL = 'ERROR'; // Reduce log noise in tests

// Mock browser APIs only if not in jsdom environment
if (!global.window) {
    // Mock navigator for Node.js environment
    Object.defineProperty(global, 'navigator', {
        value: {
            serviceWorker: {
                register: jest.fn(() => Promise.resolve({
                    scope: 'http://localhost:3000/',
                    unregister: jest.fn(() => Promise.resolve())
                }))
            },
            userAgent: 'Node.js Test Environment',
            platform: 'node',
            onLine: true
        },
        configurable: true
    });

    // Mock window for Node.js environment
    Object.defineProperty(global, 'window', {
        value: {
            crypto: {
                getRandomValues: jest.fn((arr) => {
                    for (let i = 0; i < arr.length; i++) {
                        arr[i] = Math.floor(Math.random() * 256);
                    }
                    return arr;
                })
            },
            location: {
                origin: 'http://localhost:3000',
                href: 'http://localhost:3000'
            },
            localStorage: {
                getItem: jest.fn(),
                setItem: jest.fn(),
                removeItem: jest.fn(),
                clear: jest.fn()
            },
            sessionStorage: {
                getItem: jest.fn(),
                setItem: jest.fn(),
                removeItem: jest.fn(),
                clear: jest.fn()
            }
        },
        configurable: true
    });
} else {
    // Enhance existing window object in jsdom environment
    if (!global.window.crypto) {
        global.window.crypto = {
            getRandomValues: jest.fn((arr) => {
                for (let i = 0; i < arr.length; i++) {
                    arr[i] = Math.floor(Math.random() * 256);
                }
                return arr;
            })
        };
    }
    
    // Mock serviceWorker if not available
    if (!global.navigator.serviceWorker) {
        global.navigator.serviceWorker = {
            register: jest.fn(() => Promise.resolve({
                scope: 'http://localhost:3000/',
                unregister: jest.fn(() => Promise.resolve())
            }))
        };
    }
}

// Mock performance API
if (!global.performance) {
    Object.defineProperty(global, 'performance', {
        value: {
            now: jest.fn(() => Date.now()),
            mark: jest.fn(),
            measure: jest.fn(),
            memory: {
                usedJSHeapSize: 10 * 1024 * 1024,
                totalJSHeapSize: 50 * 1024 * 1024,
                jsHeapSizeLimit: 100 * 1024 * 1024
            }
        },
        configurable: true
    });
}

// Mock fetch for API tests
global.fetch = jest.fn(() =>
    Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
        headers: new Map()
    })
);

// Mock WebSocket for socket.io tests
global.WebSocket = jest.fn(() => ({
    send: jest.fn(),
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    readyState: 1
}));

// Global test utilities
global.testHelpers = {
  // Mock Spotify API responses
  mockSpotifyTrack: {
    id: 'test_track_id',
    name: 'Test Song',
    artists: [{ name: 'Test Artist' }],
    album: { name: 'Test Album' },
    audio_features: {
      danceability: 0.7,
      energy: 0.8,
      valence: 0.6
    }
  },

  // Mock user data
  mockUser: {
    id: 'test_user_id',
    display_name: 'Test User',
    preferences: {
      genres: ['pop', 'rock'],
      audio_features: {
        danceability: 0.6,
        energy: 0.7,
        valence: 0.65
      }
    }
  },

  // Helper to create mock requests
  createMockRequest: (overrides = {}) => ({
    method: 'GET',
    url: '/test',
    headers: {},
    body: {},
    userId: 'test_user_id',
    ...overrides
  }),

  // Helper to create mock responses
  createMockResponse: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis()
    };
    return res;
  }
};

// Console override for cleaner test output
if (process.env.NODE_ENV === 'test') {
  // Only override console if jest is available
  if (typeof jest !== 'undefined') {
    global.console = {
      ...console,
      log: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
    };
  }
}

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Setup and teardown helpers
beforeEach(() => {
    jest.clearAllMocks();
});

afterEach(() => {
    // Clean up any test state
    jest.clearAllTimers();
});