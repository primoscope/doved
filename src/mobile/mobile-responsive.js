/**
 * Mobile Responsive Components and Utilities for EchoTune AI
 * Provides React Native foundation and mobile-first design utilities
 */

class MobileResponsiveManager {
  constructor() {
    this.breakpoints = {
      mobile: 768,
      tablet: 1024,
      desktop: 1280,
      largeDesktop: 1920
    };
    
    this.currentDeviceType = this.detectDeviceType();
    this.orientation = this.detectOrientation();
    this.touchSupport = this.detectTouchSupport();
    
    this.setupEventListeners();
  }

  /**
   * Detect current device type based on screen size and user agent
   */
  detectDeviceType() {
    if (typeof window === 'undefined') return 'desktop';
    
    const width = window.innerWidth;
    
    if (width <= this.breakpoints.mobile) {
      return 'mobile';
    } else if (width <= this.breakpoints.tablet) {
      return 'tablet';
    } else if (width <= this.breakpoints.desktop) {
      return 'desktop';
    } else {
      return 'largeDesktop';
    }
  }

  /**
   * Detect device orientation
   */
  detectOrientation() {
    if (typeof window === 'undefined') return 'landscape';
    
    if (window.screen && window.screen.orientation) {
      return window.screen.orientation.angle === 0 || window.screen.orientation.angle === 180 ? 'portrait' : 'landscape';
    }
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  /**
   * Detect touch support
   */
  detectTouchSupport() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  /**
   * Setup responsive event listeners
   */
  setupEventListeners() {
    if (typeof window === 'undefined') return;
    
    // Resize handler with debouncing
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.handleResize();
      }, 250);
    });

    // Orientation change handler
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.handleOrientationChange();
      }, 100);
    });

    // Touch event optimization for mobile
    if (this.touchSupport) {
      this.setupTouchOptimizations();
    }
  }

  /**
   * Handle window resize events
   */
  handleResize() {
    const newDeviceType = this.detectDeviceType();
    const newOrientation = this.detectOrientation();
    
    if (newDeviceType !== this.currentDeviceType || newOrientation !== this.orientation) {
      this.currentDeviceType = newDeviceType;
      this.orientation = newOrientation;
      this.updateLayoutForDevice();
      this.dispatchResponsiveEvent();
    }
  }

  /**
   * Handle orientation change events
   */
  handleOrientationChange() {
    this.orientation = this.detectOrientation();
    this.updateLayoutForDevice();
    this.optimizeForOrientation();
  }

  /**
   * Setup touch-specific optimizations
   */
  setupTouchOptimizations() {
    if (typeof document === 'undefined') return;
    
    // Add touch-friendly classes
    document.body.classList.add('touch-device');
    
    // Prevent zoom on double tap
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
      const now = (new Date()).getTime();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    }, false);

    // Optimize scroll performance
    document.addEventListener('touchstart', () => {}, { passive: true });
    document.addEventListener('touchmove', () => {}, { passive: true });
  }

  /**
   * Update layout based on current device type
   */
  updateLayoutForDevice() {
    if (typeof document === 'undefined') return;
    
    const body = document.body;
    
    // Remove existing device classes
    body.classList.remove('mobile-layout', 'tablet-layout', 'desktop-layout', 'large-desktop-layout');
    
    // Add current device class
    body.classList.add(`${this.currentDeviceType}-layout`);
    
    // Update chat interface
    this.updateChatInterfaceLayout();
    
    // Update player controls
    this.updatePlayerControlsLayout();
    
    // Update navigation
    this.updateNavigationLayout();
  }

  /**
   * Update chat interface for mobile responsiveness
   */
  updateChatInterfaceLayout() {
    if (typeof document === 'undefined') return;
    
    const chatContainer = document.querySelector('.chat-container');
    const chatInput = document.querySelector('.chat-input-container');
    
    if (!chatContainer || !chatInput) return;
    
    if (this.currentDeviceType === 'mobile') {
      chatContainer.style.height = 'calc(100vh - 120px)';
      chatInput.style.position = 'fixed';
      chatInput.style.bottom = '0';
      chatInput.style.left = '0';
      chatInput.style.right = '0';
      chatInput.style.zIndex = '1000';
      
      // Add mobile-specific padding
      chatContainer.style.paddingBottom = '80px';
    } else {
      // Reset for desktop
      chatContainer.style.height = '';
      chatInput.style.position = '';
      chatInput.style.bottom = '';
      chatInput.style.left = '';
      chatInput.style.right = '';
      chatContainer.style.paddingBottom = '';
    }
  }

  /**
   * Update player controls for mobile
   */
  updatePlayerControlsLayout() {
    if (typeof document === 'undefined') return;
    
    const playerControls = document.querySelector('.player-controls');
    if (!playerControls) return;
    
    if (this.currentDeviceType === 'mobile') {
      playerControls.classList.add('mobile-player');
      // Make controls larger for touch
      const buttons = playerControls.querySelectorAll('button');
      buttons.forEach(button => {
        button.style.minHeight = '44px';
        button.style.minWidth = '44px';
      });
    } else {
      playerControls.classList.remove('mobile-player');
    }
  }

  /**
   * Update navigation for mobile
   */
  updateNavigationLayout() {
    if (typeof document === 'undefined') return;
    
    const nav = document.querySelector('nav');
    if (!nav) return;
    
    if (this.currentDeviceType === 'mobile') {
      nav.classList.add('mobile-nav');
      this.createMobileMenu();
    } else {
      nav.classList.remove('mobile-nav');
      this.removeMobileMenu();
    }
  }

  /**
   * Create mobile hamburger menu
   */
  createMobileMenu() {
    if (typeof document === 'undefined') return;
    if (document.querySelector('.mobile-menu-toggle')) return;
    
    const nav = document.querySelector('nav');
    const menuToggle = document.createElement('button');
    menuToggle.className = 'mobile-menu-toggle';
    menuToggle.innerHTML = '☰';
    menuToggle.setAttribute('aria-label', 'Toggle mobile menu');
    
    menuToggle.addEventListener('click', () => {
      nav.classList.toggle('menu-open');
    });
    
    nav.insertBefore(menuToggle, nav.firstChild);
  }

  /**
   * Remove mobile menu elements
   */
  removeMobileMenu() {
    if (typeof document === 'undefined') return;
    
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    if (menuToggle) {
      menuToggle.remove();
    }
    
    const nav = document.querySelector('nav');
    if (nav) {
      nav.classList.remove('menu-open');
    }
  }

  /**
   * Optimize layout for orientation
   */
  optimizeForOrientation() {
    if (typeof document === 'undefined') return;
    
    const body = document.body;
    body.classList.remove('portrait', 'landscape');
    body.classList.add(this.orientation);
    
    if (this.currentDeviceType === 'mobile' && this.orientation === 'landscape') {
      // Optimize for mobile landscape
      const chatContainer = document.querySelector('.chat-container');
      if (chatContainer) {
        chatContainer.style.height = 'calc(100vh - 80px)';
      }
    }
  }

  /**
   * Dispatch custom responsive event
   */
  dispatchResponsiveEvent() {
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
    
    const event = new CustomEvent('responsiveChange', {
      detail: {
        deviceType: this.currentDeviceType,
        orientation: this.orientation,
        touchSupport: this.touchSupport
      }
    });
    window.dispatchEvent(event);
  }

  /**
   * Check if current device is mobile
   */
  isMobile() {
    return this.currentDeviceType === 'mobile';
  }

  /**
   * Check if current device is tablet
   */
  isTablet() {
    return this.currentDeviceType === 'tablet';
  }

  /**
   * Check if current device is desktop
   */
  isDesktop() {
    return this.currentDeviceType === 'desktop' || this.currentDeviceType === 'largeDesktop';
  }

  /**
   * Get current device info
   */
  getDeviceInfo() {
    if (typeof window === 'undefined') {
      return {
        type: this.currentDeviceType,
        orientation: this.orientation,
        touchSupport: this.touchSupport,
        screenWidth: 1920,
        screenHeight: 1080
      };
    }
    
    return {
      type: this.currentDeviceType,
      orientation: this.orientation,
      touchSupport: this.touchSupport,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight
    };
  }

  /**
   * Apply mobile-specific CSS optimizations
   */
  applyMobileOptimizations() {
    if (typeof document === 'undefined') return;
    if (!this.isMobile()) return;
    
    // Create mobile-specific styles
    const mobileStyles = `
      .mobile-layout {
        font-size: 16px; /* Prevent zoom on iOS */
      }
      
      .mobile-layout .chat-input input {
        font-size: 16px; /* Prevent zoom on focus */
      }
      
      .mobile-layout .button {
        min-height: 44px;
        min-width: 44px;
        padding: 12px 16px;
      }
      
      .mobile-layout .chat-container {
        padding: 10px;
      }
      
      .mobile-layout .chat-message {
        margin-bottom: 12px;
        max-width: 90%;
      }
      
      .mobile-nav {
        padding: 10px;
      }
      
      .mobile-menu-toggle {
        background: none;
        border: none;
        color: var(--text-primary);
        font-size: 24px;
        padding: 8px;
        cursor: pointer;
      }
      
      .mobile-nav ul {
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--background-dark);
        box-shadow: var(--shadow);
        z-index: 1000;
      }
      
      .mobile-nav.menu-open ul {
        display: block;
      }
      
      .mobile-nav li {
        display: block;
        border-bottom: 1px solid var(--background-light);
      }
      
      .mobile-nav a {
        display: block;
        padding: 15px 20px;
        text-decoration: none;
        color: var(--text-primary);
      }
      
      @media (max-width: 768px) {
        .desktop-only {
          display: none !important;
        }
        
        .mobile-only {
          display: block !important;
        }
      }
      
      @media (min-width: 769px) {
        .mobile-only {
          display: none !important;
        }
        
        .desktop-only {
          display: block !important;
        }
      }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = mobileStyles;
    document.head.appendChild(styleSheet);
  }
}

// React Native Foundation Components
class ReactNativeFoundation {
  constructor() {
    this.components = new Map();
    this.bridges = new Map();
  }

  /**
   * Register a React Native-style component
   */
  registerComponent(name, component) {
    this.components.set(name, component);
  }

  /**
   * Create a bridge to native functionality
   */
  createNativeBridge(name, methods) {
    this.bridges.set(name, methods);
    return methods;
  }

  /**
   * Mobile-first View component
   */
  createView(props = {}) {
    const element = document.createElement('div');
    element.className = 'rn-view';
    
    // Apply React Native-style props
    if (props.style) {
      Object.assign(element.style, props.style);
    }
    
    if (props.className) {
      element.className += ` ${props.className}`;
    }
    
    return element;
  }

  /**
   * Mobile-optimized Text component
   */
  createText(content, props = {}) {
    const element = document.createElement('span');
    element.className = 'rn-text';
    element.textContent = content;
    
    if (props.style) {
      Object.assign(element.style, props.style);
    }
    
    return element;
  }

  /**
   * Touch-optimized Button component
   */
  createTouchableOpacity(props = {}) {
    const button = document.createElement('button');
    button.className = 'rn-touchable';
    
    // Touch feedback
    button.addEventListener('touchstart', () => {
      button.style.opacity = '0.7';
    });
    
    button.addEventListener('touchend', () => {
      button.style.opacity = '1';
    });
    
    if (props.onPress) {
      button.addEventListener('click', props.onPress);
    }
    
    return button;
  }

  /**
   * Initialize React Native-style components
   */
  initializeComponents() {
    // Register base components
    this.registerComponent('View', this.createView);
    this.registerComponent('Text', this.createText);
    this.registerComponent('TouchableOpacity', this.createTouchableOpacity);
    
    // Create native bridges
    this.createNativeBridge('Dimensions', {
      get: () => {
        if (typeof window === 'undefined') {
          return { width: 1920, height: 1080 };
        }
        return {
          width: window.innerWidth,
          height: window.innerHeight
        };
      }
    });
    
    this.createNativeBridge('Platform', {
      OS: this.detectPlatform(),
      select: (platforms) => {
        const os = this.detectPlatform();
        return platforms[os] || platforms.default;
      }
    });
  }

  /**
   * Detect platform for React Native compatibility
   */
  detectPlatform() {
    if (typeof navigator === 'undefined') return 'web';
    
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (/android/.test(userAgent)) {
      return 'android';
    } else if (/iphone|ipad|ipod/.test(userAgent)) {
      return 'ios';
    } else {
      return 'web';
    }
  }
}

// Initialize mobile responsive manager
let mobileResponsive, reactNative;

// Check if we're in a browser environment
if (typeof window !== 'undefined') {
  mobileResponsive = new MobileResponsiveManager();
  reactNative = new ReactNativeFoundation();

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mobileResponsive.applyMobileOptimizations();
      reactNative.initializeComponents();
    });
  } else {
    mobileResponsive.applyMobileOptimizations();
    reactNative.initializeComponents();
  }
}

// Browser-compatible exports
if (typeof window !== 'undefined') {
  window.MobileResponsiveManager = MobileResponsiveManager;
  window.ReactNativeFoundation = ReactNativeFoundation;
  window.mobileResponsive = mobileResponsive;
  window.reactNative = reactNative;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MobileResponsiveManager,
    ReactNativeFoundation,
    mobileResponsive,
    reactNative
  };
}