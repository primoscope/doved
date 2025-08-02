// React is needed for JSX
import { useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Auth Callback Component
 * Handles Spotify OAuth callback
 */
function AuthCallback() {
  const { checkAuthStatus } = useAuth();

  const handleAuthCallback = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    const error = urlParams.get('error');

    if (error) {
      alert(`Authentication failed: ${error.replace(/_/g, ' ')}`);
      window.location.href = '/';
      return;
    }

    if (authStatus === 'success') {
      // Refresh auth status to get user data
      await checkAuthStatus();
      
      // Redirect to home page
      window.location.href = '/?auth=success';
    } else {
      window.location.href = '/';
    }
  }, [checkAuthStatus]);

  useEffect(() => {
    handleAuthCallback();
  }, [handleAuthCallback]);

  return (
    <div className="auth-callback">
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <h2>Connecting to Spotify...</h2>
        <p>Please wait while we complete the authentication process.</p>
      </div>
    </div>
  );
}

export default AuthCallback;