/**
 * Enhanced Music Features for EchoTune AI
 * Adds advanced functionality for music recommendations and playlist management
 */

class EnhancedMusicFeatures {
    constructor() {
        this.currentRecommendations = [];
        this.playlistBuilder = [];
        this.isCreatingPlaylist = false;
        this.init();
    }

    init() {
        this.setupPlaylistBuilder();
        this.setupMusicPreview();
        this.setupAdvancedSuggestions();
        this.setupKeyboardShortcuts();
        console.log('🎵 Enhanced Music Features initialized');
    }

    /**
     * Setup playlist builder interface
     */
    setupPlaylistBuilder() {
        // Add playlist builder UI
        const chatContainer = document.querySelector('.chat-messages');
        if (chatContainer) {
            this.createPlaylistBuilderUI();
        }
    }

    createPlaylistBuilderUI() {
        const playlistUI = document.createElement('div');
        playlistUI.className = 'playlist-builder';
        playlistUI.innerHTML = `
            <div class="playlist-header">
                <h3>🎵 Playlist Builder</h3>
                <span class="playlist-count">0 tracks</span>
            </div>
            <div class="playlist-tracks"></div>
            <div class="playlist-actions">
                <button class="create-playlist-btn" onclick="enhancedMusic.createSpotifyPlaylist()">
                    🎧 Create in Spotify
                </button>
                <button class="clear-playlist-btn" onclick="enhancedMusic.clearPlaylist()">
                    🗑️ Clear
                </button>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .playlist-builder {
                background: rgba(29, 185, 84, 0.1);
                border: 1px solid var(--primary-color);
                border-radius: var(--border-radius);
                margin: 15px 0;
                padding: 15px;
                display: none;
            }

            .playlist-builder.active {
                display: block;
            }

            .playlist-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }

            .playlist-header h3 {
                margin: 0;
                color: var(--primary-color);
                font-size: 1.1rem;
            }

            .playlist-count {
                background: var(--primary-color);
                color: var(--secondary-color);
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 0.8rem;
                font-weight: bold;
            }

            .playlist-tracks {
                min-height: 40px;
                max-height: 200px;
                overflow-y: auto;
                margin-bottom: 15px;
            }

            .playlist-track {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 6px;
                margin-bottom: 5px;
                border-left: 3px solid var(--primary-color);
            }

            .playlist-track:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .track-info {
                flex: 1;
            }

            .track-name {
                font-weight: bold;
                color: var(--text-primary);
            }

            .track-artist {
                color: var(--text-secondary);
                font-size: 0.9rem;
            }

            .track-remove {
                background: var(--error-color);
                color: white;
                border: none;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.8rem;
            }

            .track-remove:hover {
                background: #c41e3a;
            }

            .playlist-actions {
                display: flex;
                gap: 10px;
            }

            .create-playlist-btn, .clear-playlist-btn {
                flex: 1;
                padding: 10px;
                border: none;
                border-radius: var(--border-radius);
                cursor: pointer;
                font-weight: bold;
                transition: all 0.3s ease;
            }

            .create-playlist-btn {
                background: var(--gradient-primary);
                color: white;
            }

            .create-playlist-btn:hover {
                transform: translateY(-2px);
                box-shadow: var(--shadow);
            }

            .create-playlist-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }

            .clear-playlist-btn {
                background: rgba(226, 33, 52, 0.2);
                color: var(--error-color);
                border: 1px solid var(--error-color);
            }

            .clear-playlist-btn:hover {
                background: var(--error-color);
                color: white;
            }

            .track-add-btn {
                background: rgba(29, 185, 84, 0.2);
                color: var(--primary-color);
                border: 1px solid var(--primary-color);
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.8rem;
                margin-left: 8px;
                transition: all 0.2s ease;
            }

            .track-add-btn:hover {
                background: var(--primary-color);
                color: white;
            }

            .track-add-btn.added {
                background: var(--primary-color);
                color: white;
            }

            @media (max-width: 768px) {
                .playlist-actions {
                    flex-direction: column;
                }
                
                .create-playlist-btn, .clear-playlist-btn {
                    min-height: 44px;
                }
            }
        `;
        document.head.appendChild(style);

        // Insert after chat messages
        const chatMessages = document.querySelector('.chat-messages');
        if (chatMessages) {
            chatMessages.parentNode.insertBefore(playlistUI, chatMessages.nextSibling);
        }
    }

    /**
     * Setup music preview functionality
     */
    setupMusicPreview() {
        // Enhance message display to include music previews
        this.enhanceMessageDisplay();
    }

    enhanceMessageDisplay() {
        // Monitor for new messages and enhance them with music features
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('message')) {
                            this.enhanceMessage(node);
                        }
                    });
                }
            });
        });

        const chatMessages = document.querySelector('.chat-messages');
        if (chatMessages) {
            observer.observe(chatMessages, { childList: true, subtree: true });
        }
    }

    enhanceMessage(messageElement) {
        if (messageElement.classList.contains('assistant')) {
            const messageText = messageElement.textContent || '';
            const tracks = this.extractTracksFromMessage(messageText);
            
            if (tracks.length > 0) {
                this.addTrackButtons(messageElement, tracks);
                this.showPlaylistBuilder();
            }
        }
    }

    extractTracksFromMessage(text) {
        const tracks = [];
        
        // Enhanced pattern to extract track and artist information
        const patterns = [
            /"([^"]+)" by ([^.,\n]+)/g,  // "Track Name" by Artist
            /([A-Z][^.!?]*) - ([^.,\n]+)/g,  // Track Name - Artist
            /Track:\s*"([^"]+)"/g,  // Track: "Track Name"
            /Artist:\s*([^.,\n]+)/g,  // Artist: Artist Name
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                if (pattern.toString().includes('Track:')) {
                    tracks.push({ name: match[1], artist: 'Unknown' });
                } else if (pattern.toString().includes('Artist:')) {
                    if (tracks.length > 0 && tracks[tracks.length - 1].artist === 'Unknown') {
                        tracks[tracks.length - 1].artist = match[1];
                    }
                } else {
                    tracks.push({ name: match[1], artist: match[2] });
                }
            }
        });

        return tracks;
    }

    addTrackButtons(messageElement, tracks) {
        tracks.forEach(track => {
            const trackButton = document.createElement('button');
            trackButton.className = 'track-add-btn';
            trackButton.textContent = `+ Add "${track.name}"`;
            trackButton.onclick = () => this.addToPlaylist(track, trackButton);
            
            // Find a good place to insert the button
            const trackRegex = new RegExp(`"${track.name}"`, 'i');
            const walker = document.createTreeWalker(
                messageElement,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let textNode;
            while (textNode = walker.nextNode()) {
                if (trackRegex.test(textNode.textContent)) {
                    const span = document.createElement('span');
                    span.appendChild(trackButton.cloneNode(true));
                    span.onclick = () => this.addToPlaylist(track, span.firstChild);
                    textNode.parentNode.insertBefore(span, textNode.nextSibling);
                    break;
                }
            }
        });
    }

    addToPlaylist(track, button) {
        // Check if track already exists
        const exists = this.playlistBuilder.some(t => 
            t.name.toLowerCase() === track.name.toLowerCase() && 
            t.artist.toLowerCase() === track.artist.toLowerCase()
        );

        if (!exists) {
            this.playlistBuilder.push({
                ...track,
                id: Date.now() + Math.random() // Simple ID generation
            });
            
            button.textContent = '✓ Added';
            button.classList.add('added');
            button.disabled = true;
            
            this.updatePlaylistUI();
            this.showPlaylistBuilder();
            
            // Show success feedback
            this.showNotification(`Added "${track.name}" to playlist`, 'success');
        } else {
            this.showNotification(`"${track.name}" is already in playlist`, 'info');
        }
    }

    updatePlaylistUI() {
        const playlistTracks = document.querySelector('.playlist-tracks');
        const playlistCount = document.querySelector('.playlist-count');
        
        if (!playlistTracks || !playlistCount) return;

        playlistCount.textContent = `${this.playlistBuilder.length} tracks`;
        
        playlistTracks.innerHTML = this.playlistBuilder.map(track => `
            <div class="playlist-track" data-track-id="${track.id}">
                <div class="track-info">
                    <div class="track-name">${track.name}</div>
                    <div class="track-artist">${track.artist}</div>
                </div>
                <button class="track-remove" onclick="enhancedMusic.removeFromPlaylist('${track.id}')">
                    ✕
                </button>
            </div>
        `).join('');

        // Enable/disable create button
        const createBtn = document.querySelector('.create-playlist-btn');
        if (createBtn) {
            createBtn.disabled = this.playlistBuilder.length === 0;
        }
    }

    removeFromPlaylist(trackId) {
        this.playlistBuilder = this.playlistBuilder.filter(track => track.id != trackId);
        this.updatePlaylistUI();
        
        if (this.playlistBuilder.length === 0) {
            this.hidePlaylistBuilder();
        }
    }

    clearPlaylist() {
        this.playlistBuilder = [];
        this.updatePlaylistUI();
        this.hidePlaylistBuilder();
        
        // Reset all add buttons
        document.querySelectorAll('.track-add-btn.added').forEach(btn => {
            btn.textContent = btn.textContent.replace('✓ Added', '+ Add');
            btn.classList.remove('added');
            btn.disabled = false;
        });
        
        this.showNotification('Playlist cleared', 'info');
    }

    showPlaylistBuilder() {
        const builder = document.querySelector('.playlist-builder');
        if (builder) {
            builder.classList.add('active');
        }
    }

    hidePlaylistBuilder() {
        const builder = document.querySelector('.playlist-builder');
        if (builder) {
            builder.classList.remove('active');
        }
    }

    async createSpotifyPlaylist() {
        if (this.playlistBuilder.length === 0) {
            this.showNotification('Add some tracks first!', 'warning');
            return;
        }

        this.isCreatingPlaylist = true;
        const createBtn = document.querySelector('.create-playlist-btn');
        if (createBtn) {
            createBtn.textContent = '🔄 Creating...';
            createBtn.disabled = true;
        }

        try {
            // Generate a playlist name based on current context
            const playlistName = this.generatePlaylistName();
            
            // For demo purposes, create a local playlist and show Spotify connection prompt
            const response = await fetch('/api/playlists/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: playlistName,
                    description: `Created by EchoTune AI - ${new Date().toLocaleDateString()}`,
                    tracks: this.playlistBuilder,
                    public: false,
                    userId: 'demo_user' // Demo user for testing
                })
            });

            const result = await response.json();

            if (result.success) {
                if (result.spotifyPlaylist) {
                    this.showNotification('Playlist created successfully in Spotify!', 'success');
                } else {
                    this.showNotification('Playlist saved! Connect Spotify to sync with your account.', 'info');
                    this.showSpotifyConnectPrompt(result.playlist);
                }
                this.clearPlaylist();
            } else {
                throw new Error(result.message || 'Failed to create playlist');
            }
        } catch (error) {
            console.error('Playlist creation error:', error);
            this.showNotification(`Failed to create playlist: ${error.message}`, 'error');
        } finally {
            this.isCreatingPlaylist = false;
            if (createBtn) {
                createBtn.textContent = '🎧 Create in Spotify';
                createBtn.disabled = this.playlistBuilder.length === 0;
            }
        }
    }

    showSpotifyConnectPrompt(playlist) {
        const prompt = document.createElement('div');
        prompt.className = 'spotify-connect-prompt';
        prompt.innerHTML = `
            <div class="prompt-content">
                <h3>🎵 Playlist Created!</h3>
                <p>Your playlist "${playlist.name}" has been saved with ${playlist.trackCount} tracks.</p>
                <p>Connect your Spotify account to sync this playlist and future recommendations.</p>
                <div class="prompt-actions">
                    <a href="/auth/spotify" class="connect-spotify-btn">
                        🎧 Connect Spotify
                    </a>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" class="dismiss-btn">
                        Maybe Later
                    </button>
                </div>
            </div>
        `;

        // Add prompt styles
        if (!document.querySelector('#spotify-prompt-styles')) {
            const style = document.createElement('style');
            style.id = 'spotify-prompt-styles';
            style.textContent = `
                .spotify-connect-prompt {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1001;
                    opacity: 0;
                    animation: fadeInPrompt 0.3s ease forwards;
                }

                @keyframes fadeInPrompt {
                    to { opacity: 1; }
                }

                .prompt-content {
                    background: var(--background-light);
                    border: 1px solid var(--primary-color);
                    border-radius: var(--border-radius);
                    padding: 30px;
                    max-width: 400px;
                    width: 90%;
                    text-align: center;
                    box-shadow: var(--shadow);
                }

                .prompt-content h3 {
                    color: var(--primary-color);
                    margin-bottom: 15px;
                }

                .prompt-content p {
                    color: var(--text-secondary);
                    margin-bottom: 10px;
                    line-height: 1.4;
                }

                .prompt-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }

                .connect-spotify-btn {
                    flex: 1;
                    background: var(--gradient-primary);
                    color: white;
                    text-decoration: none;
                    padding: 12px 20px;
                    border-radius: var(--border-radius);
                    font-weight: bold;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .connect-spotify-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--shadow);
                }

                .dismiss-btn {
                    flex: 1;
                    background: rgba(255, 255, 255, 0.1);
                    color: var(--text-secondary);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    padding: 12px 20px;
                    border-radius: var(--border-radius);
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .dismiss-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                    color: var(--text-primary);
                }

                @media (max-width: 768px) {
                    .prompt-actions {
                        flex-direction: column;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(prompt);

        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            if (prompt.parentNode) {
                prompt.style.opacity = '0';
                setTimeout(() => prompt.remove(), 300);
            }
        }, 10000);
    }

    generatePlaylistName() {
        const now = new Date();
        const timeOfDay = now.getHours() < 12 ? 'Morning' : 
                         now.getHours() < 17 ? 'Afternoon' : 'Evening';
        
        const suggestions = [
            `EchoTune ${timeOfDay} Mix`,
            `AI Curated Playlist`,
            `My EchoTune Discoveries`,
            `Personal Mix ${now.toLocaleDateString()}`,
            `AI Recommendations`
        ];
        
        return suggestions[Math.floor(Math.random() * suggestions.length)];
    }

    /**
     * Setup advanced suggestions
     */
    setupAdvancedSuggestions() {
        const suggestionContainer = document.querySelector('.suggestion-chips');
        if (suggestionContainer) {
            this.addAdvancedSuggestions(suggestionContainer);
        }
    }

    addAdvancedSuggestions(container) {
        const advancedSuggestions = [
            { text: '🎹 Jazz for Focus', prompt: 'Create a jazz playlist perfect for deep focus and concentration' },
            { text: '🏃‍♀️ High Energy Workout', prompt: 'I need high-energy music for an intense workout session' },
            { text: '🌙 Chill Night Vibes', prompt: 'Suggest some chill, atmospheric music for a relaxing evening' },
            { text: '🚗 Road Trip Classics', prompt: 'Create the perfect road trip playlist with sing-along classics' },
            { text: '🎸 Discover New Rock', prompt: 'Help me discover new rock artists similar to my taste' },
            { text: '🎵 Mood-based Mix', prompt: 'Create a playlist that matches my current mood and energy level' }
        ];

        advancedSuggestions.forEach(suggestion => {
            const chip = document.createElement('div');
            chip.className = 'suggestion-chip advanced';
            chip.textContent = suggestion.text;
            chip.onclick = () => {
                const chatInput = document.querySelector('#chat-input');
                if (chatInput) {
                    chatInput.value = suggestion.prompt;
                    chatInput.focus();
                }
            };
            container.appendChild(chip);
        });
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Enter to send message
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                const sendBtn = document.querySelector('.send-button');
                if (sendBtn) sendBtn.click();
            }
            
            // Escape to clear input
            if (e.key === 'Escape') {
                const chatInput = document.querySelector('#chat-input');
                if (chatInput && chatInput.value) {
                    chatInput.value = '';
                    chatInput.focus();
                }
            }
            
            // Ctrl/Cmd + K to focus input
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                const chatInput = document.querySelector('#chat-input');
                if (chatInput) {
                    chatInput.focus();
                    chatInput.select();
                }
            }
        });
    }

    /**
     * Show notification to user
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add notification styles if not already present
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 12px 20px;
                    border-radius: var(--border-radius);
                    color: white;
                    font-weight: bold;
                    z-index: 1000;
                    opacity: 0;
                    transform: translateX(100%);
                    transition: all 0.3s ease;
                }
                
                .notification.show {
                    opacity: 1;
                    transform: translateX(0);
                }
                
                .notification.success {
                    background: var(--success-color);
                }
                
                .notification.error {
                    background: var(--error-color);
                }
                
                .notification.warning {
                    background: var(--warning-color);
                }
                
                .notification.info {
                    background: var(--primary-color);
                }
                
                @media (max-width: 768px) {
                    .notification {
                        top: 10px;
                        right: 10px;
                        left: 10px;
                        transform: translateY(-100%);
                    }
                    
                    .notification.show {
                        transform: translateY(0);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        // Trigger animation
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Remove after delay
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize enhanced features when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.enhancedMusic = new EnhancedMusicFeatures();
    });
} else {
    window.enhancedMusic = new EnhancedMusicFeatures();
}