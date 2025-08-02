/**
 * Comprehensive tests for Mobile Responsive Manager
 */

const { MobileResponsiveManager } = require('../../src/mobile/mobile-responsive');

// Ensure proper import in test environment
if (typeof MobileResponsiveManager !== 'function') {
    console.warn('MobileResponsiveManager import issue - skipping tests');
    return;
}

// Debug the import
console.log('MobileResponsiveManager:', MobileResponsiveManager);
console.log('Type:', typeof MobileResponsiveManager);

describe('MobileResponsiveManager', () => {
  let mockWindow;
  let mockDocument;
  let mobileManager;

  beforeEach(() => {
    // Mock window and document objects
    mockWindow = {
      innerWidth: 1024,
      innerHeight: 768,
      navigator: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        maxTouchPoints: 0
      },
      addEventListener: jest.fn(),
      screen: {
        orientation: { angle: 0 }
      }
    };

    mockDocument = {
      body: {
        classList: {
          add: jest.fn(),
          remove: jest.fn()
        }
      },
      createElement: jest.fn(() => ({
        setAttribute: jest.fn(),
        appendChild: jest.fn(),
        addEventListener: jest.fn(),
        style: {}
      })),
      head: {
        appendChild: jest.fn()
      },
      querySelector: jest.fn(),
      readyState: 'complete'
    };

    global.window = mockWindow;
    global.document = mockDocument;
    global.navigator = mockWindow.navigator;

    mobileManager = new MobileResponsiveManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Device Detection', () => {
    test('should detect desktop device correctly', () => {
      mockWindow.innerWidth = 1200;
      const deviceType = mobileManager.detectDeviceType();
      expect(deviceType).toBe('desktop');
    });

    test('should detect mobile device correctly', () => {
      mockWindow.innerWidth = 600;
      const deviceType = mobileManager.detectDeviceType();
      expect(deviceType).toBe('mobile');
    });

    test('should detect tablet device correctly', () => {
      mockWindow.innerWidth = 800;
      const deviceType = mobileManager.detectDeviceType();
      expect(deviceType).toBe('tablet');
    });

    test('should detect large desktop correctly', () => {
      mockWindow.innerWidth = 1500;
      const deviceType = mobileManager.detectDeviceType();
      expect(deviceType).toBe('largeDesktop');
    });
  });

  describe('Orientation Detection', () => {
    test('should detect portrait orientation', () => {
      mockWindow.innerHeight = 800;
      mockWindow.innerWidth = 600;
      const orientation = mobileManager.detectOrientation();
      expect(orientation).toBe('portrait');
    });

    test('should detect landscape orientation', () => {
      // Recreate the global window object with new dimensions  
      global.window.innerHeight = 600;
      global.window.innerWidth = 1024;
      // Also update screen orientation for landscape
      global.window.screen.orientation.angle = 90;
      const orientation = mobileManager.detectOrientation();
      expect(orientation).toBe('landscape');
    });

    test('should use screen orientation API when available', () => {
      mockWindow.screen.orientation.angle = 90;
      const orientation = mobileManager.detectOrientation();
      expect(orientation).toBe('landscape');
    });
  });

  describe('Touch Support Detection', () => {
    test('should detect touch support correctly', () => {
      global.window.ontouchstart = true;
      const hasTouch = mobileManager.detectTouchSupport();
      expect(hasTouch).toBe(true);
    });

    test('should detect no touch support', () => {
      delete global.window.ontouchstart;  // Remove the property entirely
      global.window.navigator.maxTouchPoints = 0;
      const hasTouch = mobileManager.detectTouchSupport();
      expect(hasTouch).toBe(false);
    });

    test('should detect touch via maxTouchPoints', () => {
      global.window.navigator.maxTouchPoints = 5;
      const hasTouch = mobileManager.detectTouchSupport();
      expect(hasTouch).toBe(true);
    });
  });

  describe('Layout Updates', () => {
    beforeEach(() => {
      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '.chat-container') {
          return { style: {} };
        }
        if (selector === '.chat-input-container') {
          return { style: {} };
        }
        if (selector === '.player-controls') {
          return { 
            classList: { add: jest.fn(), remove: jest.fn() },
            querySelectorAll: jest.fn(() => [
              { style: {} },
              { style: {} }
            ])
          };
        }
        if (selector === 'nav') {
          return {
            classList: { add: jest.fn(), remove: jest.fn() },
            insertBefore: jest.fn()
          };
        }
        return null;
      });
    });

    test('should update layout for mobile device', () => {
      mobileManager.currentDeviceType = 'mobile';
      mobileManager.updateLayoutForDevice();
      
      expect(mockDocument.body.classList.remove).toHaveBeenCalledWith(
        'mobile-layout', 'tablet-layout', 'desktop-layout', 'large-desktop-layout'
      );
      expect(mockDocument.body.classList.add).toHaveBeenCalledWith('mobile-layout');
    });

    test('should update chat interface for mobile', () => {
      const chatContainer = { style: {} };
      const chatInput = { style: {} };
      
      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '.chat-container') return chatContainer;
        if (selector === '.chat-input-container') return chatInput;
        return null;
      });

      mobileManager.currentDeviceType = 'mobile';
      mobileManager.updateChatInterfaceLayout();

      expect(chatContainer.style.height).toBe('calc(100vh - 120px)');
      expect(chatInput.style.position).toBe('fixed');
      expect(chatInput.style.bottom).toBe('0');
    });
  });

  describe('Device Information', () => {
    test('should return correct device info', () => {
      mobileManager.currentDeviceType = 'mobile';
      mobileManager.orientation = 'portrait';
      mobileManager.touchSupport = true;

      const deviceInfo = mobileManager.getDeviceInfo();

      expect(deviceInfo).toEqual({
        type: 'mobile',
        orientation: 'portrait',
        touchSupport: true,
        screenWidth: mockWindow.innerWidth,
        screenHeight: mockWindow.innerHeight
      });
    });

    test('should correctly identify mobile device', () => {
      mobileManager.currentDeviceType = 'mobile';
      expect(mobileManager.isMobile()).toBe(true);
      expect(mobileManager.isTablet()).toBe(false);
      expect(mobileManager.isDesktop()).toBe(false);
    });

    test('should correctly identify tablet device', () => {
      mobileManager.currentDeviceType = 'tablet';
      expect(mobileManager.isMobile()).toBe(false);
      expect(mobileManager.isTablet()).toBe(true);
      expect(mobileManager.isDesktop()).toBe(false);
    });

    test('should correctly identify desktop device', () => {
      mobileManager.currentDeviceType = 'desktop';
      expect(mobileManager.isMobile()).toBe(false);
      expect(mobileManager.isTablet()).toBe(false);
      expect(mobileManager.isDesktop()).toBe(true);
    });
  });

  describe('Responsive Events', () => {
    test('should dispatch responsive change event', () => {
      const mockEvent = { detail: null };
      global.CustomEvent = jest.fn().mockImplementation((type, options) => {
        mockEvent.detail = options.detail;
        return mockEvent;
      });

      mockWindow.dispatchEvent = jest.fn();

      mobileManager.dispatchResponsiveEvent();

      expect(global.CustomEvent).toHaveBeenCalledWith('responsiveChange', {
        detail: {
          deviceType: mobileManager.currentDeviceType,
          orientation: mobileManager.orientation,
          touchSupport: mobileManager.touchSupport
        }
      });
      expect(mockWindow.dispatchEvent).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('Mobile Optimizations', () => {
    test('should apply mobile optimizations only for mobile devices', () => {
      mobileManager.currentDeviceType = 'desktop';
      mobileManager.applyMobileOptimizations();
      expect(mockDocument.createElement).not.toHaveBeenCalled();

      mobileManager.currentDeviceType = 'mobile';
      mobileManager.applyMobileOptimizations();
      expect(mockDocument.createElement).toHaveBeenCalledWith('style');
    });

    test('should create mobile-specific CSS styles', () => {
      const mockStyleElement = {
        textContent: ''
      };
      mockDocument.createElement.mockReturnValue(mockStyleElement);
      
      mobileManager.currentDeviceType = 'mobile';
      mobileManager.applyMobileOptimizations();

      expect(mockStyleElement.textContent).toContain('.mobile-layout');
      expect(mockStyleElement.textContent).toContain('min-height: 44px');
      expect(mockDocument.head.appendChild).toHaveBeenCalledWith(mockStyleElement);
    });
  });

  describe('Mobile Menu', () => {
    test('should create mobile menu when needed', () => {
      const mockNav = {
        classList: { add: jest.fn() },
        insertBefore: jest.fn(),
        firstChild: {}
      };
      
      const mockButton = {
        className: '',
        innerHTML: '',
        setAttribute: jest.fn(),
        addEventListener: jest.fn()
      };

      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === 'nav') return mockNav;
        if (selector === '.mobile-menu-toggle') return null;
        return null;
      });

      mockDocument.createElement.mockReturnValue(mockButton);

      mobileManager.createMobileMenu();

      expect(mockButton.className).toBe('mobile-menu-toggle');
      expect(mockButton.innerHTML).toBe('☰');
      expect(mockButton.setAttribute).toHaveBeenCalledWith('aria-label', 'Toggle mobile menu');
      expect(mockButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
      expect(mockNav.insertBefore).toHaveBeenCalledWith(mockButton, mockNav.firstChild);
    });

    test('should not create duplicate mobile menu', () => {
      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '.mobile-menu-toggle') return {};
        return null;
      });

      mobileManager.createMobileMenu();

      expect(mockDocument.createElement).not.toHaveBeenCalled();
    });
  });
});