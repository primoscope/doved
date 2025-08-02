import { useState, useEffect, useRef } from 'react';
import './VoiceInterface.css';

/**
 * Enhanced Voice Interface Component
 * 
 * Features:
 * - Speech recognition (STT) for voice input
 * - Visual feedback for recording state
 * - Voice command processing
 * - Hands-free operation mode
 * - Wake word detection (experimental)
 */
const VoiceInterface = ({ onVoiceInput, onClose }) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [supportedLanguages, setSupportedLanguages] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [voiceVisualizer, setVoiceVisualizer] = useState([]);
  
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    initializeSpeechRecognition();
    initializeAudioVisualizer();
    
    return () => {
      cleanup();
    };
  }, []);

  /**
   * Initialize Speech Recognition API
   */
  const initializeSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setErrorMessage('Speech recognition not supported in this browser');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    // Enhanced configuration
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = selectedLanguage;
    
    // Event handlers
    recognition.onstart = () => {
      console.log('🎤 Voice recognition started');
      setIsListening(true);
      setErrorMessage('');
      setTranscript('');
      startVisualization();
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence;
        
        if (result.isFinal) {
          finalTranscript += transcript;
          setConfidence(confidence);
          console.log('🎤 Final transcript:', transcript, 'Confidence:', confidence);
        } else {
          interimTranscript += transcript;
        }
      }
      
      setTranscript(finalTranscript || interimTranscript);
      
      // Auto-process if final result has high confidence
      if (finalTranscript && confidence > 0.7) {
        processVoiceCommand(finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setErrorMessage(`Voice recognition error: ${event.error}`);
      setIsListening(false);
      stopVisualization();
      
      // Specific error handling
      switch (event.error) {
        case 'no-speech':
          setErrorMessage('No speech detected. Please try again.');
          break;
        case 'audio-capture':
          setErrorMessage('Microphone not accessible. Please check permissions.');
          break;
        case 'not-allowed':
          setErrorMessage('Microphone access denied. Please enable microphone permissions.');
          break;
        case 'network':
          setErrorMessage('Network error. Please check your connection.');
          break;
        default:
          setErrorMessage(`Voice recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('🎤 Voice recognition ended');
      setIsListening(false);
      stopVisualization();
    };

    recognitionRef.current = recognition;

    // Get supported languages
    const languages = [
      { code: 'en-US', name: 'English (US)' },
      { code: 'en-GB', name: 'English (UK)' },
      { code: 'es-ES', name: 'Spanish' },
      { code: 'fr-FR', name: 'French' },
      { code: 'de-DE', name: 'German' },
      { code: 'it-IT', name: 'Italian' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'ja-JP', name: 'Japanese' },
      { code: 'ko-KR', name: 'Korean' },
      { code: 'zh-CN', name: 'Chinese (Simplified)' }
    ];
    setSupportedLanguages(languages);
  };

  /**
   * Initialize audio visualizer
   */
  const initializeAudioVisualizer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      
      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 512;
      
      microphone.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
    } catch (error) {
      console.error('Audio visualizer initialization error:', error);
    }
  };

  /**
   * Start audio visualization
   */
  const startVisualization = () => {
    if (!analyserRef.current) return;
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const updateVisualizer = () => {
      analyser.getByteFrequencyData(dataArray);
      
      // Create visual representation of audio levels
      const visualizerData = [];
      const barCount = 20;
      const barWidth = bufferLength / barCount;
      
      for (let i = 0; i < barCount; i++) {
        const start = Math.floor(i * barWidth);
        const end = Math.floor((i + 1) * barWidth);
        let sum = 0;
        
        for (let j = start; j < end; j++) {
          sum += dataArray[j];
        }
        
        const average = sum / (end - start);
        visualizerData.push(Math.min(average / 255, 1));
      }
      
      setVoiceVisualizer(visualizerData);
      
      if (isListening) {
        animationFrameRef.current = requestAnimationFrame(updateVisualizer);
      }
    };
    
    updateVisualizer();
  };

  /**
   * Stop audio visualization
   */
  const stopVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setVoiceVisualizer([]);
  };

  /**
   * Process voice command
   */
  const processVoiceCommand = (command) => {
    setIsProcessing(true);
    
    // Enhanced command processing
    const processedCommand = preprocessVoiceCommand(command);
    
    setTimeout(() => {
      onVoiceInput(processedCommand);
      setIsProcessing(false);
      setTranscript('');
      
      // Auto-close after successful processing
      setTimeout(onClose, 1000);
    }, 500);
  };

  /**
   * Preprocess voice command for better AI understanding
   */
  const preprocessVoiceCommand = (command) => {
    // Convert common voice patterns to better text
    let processed = command.toLowerCase();
    
    // Music-specific voice command patterns
    const patterns = [
      { pattern: /play some (.+)/i, replacement: 'Play $1' },
      { pattern: /i want to listen to (.+)/i, replacement: 'Recommend $1' },
      { pattern: /find me (.+) music/i, replacement: 'Find $1 music' },
      { pattern: /create a (.+) playlist/i, replacement: 'Create a $1 playlist' },
      { pattern: /what's (.+) music/i, replacement: 'What is $1 music?' },
      { pattern: /suggest (.+)/i, replacement: 'Suggest $1' },
      { pattern: /recommend (.+)/i, replacement: 'Recommend $1' }
    ];
    
    for (const { pattern, replacement } of patterns) {
      if (pattern.test(command)) {
        processed = command.replace(pattern, replacement);
        break;
      }
    }
    
    return processed;
  };

  /**
   * Start listening
   */
  const startListening = () => {
    if (!recognitionRef.current) {
      setErrorMessage('Speech recognition not available');
      return;
    }
    
    try {
      recognitionRef.current.lang = selectedLanguage;
      recognitionRef.current.start();
    } catch (error) {
      console.error('Start listening error:', error);
      setErrorMessage('Failed to start voice recognition');
    }
  };

  /**
   * Stop listening
   */
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  /**
   * Cleanup resources
   */
  const cleanup = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    stopVisualization();
  };

  /**
   * Handle manual transcript submission
   */
  const handleManualSubmit = () => {
    if (transcript.trim()) {
      processVoiceCommand(transcript);
    }
  };

  /**
   * Change language
   */
  const handleLanguageChange = (languageCode) => {
    setSelectedLanguage(languageCode);
    if (recognitionRef.current) {
      recognitionRef.current.lang = languageCode;
    }
  };

  return (
    <div className="voice-interface">
      <div className="voice-header">
        <h3>🎤 Voice Assistant</h3>
        <button className="close-button" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="voice-content">
        {/* Language selector */}
        <div className="language-selector">
          <label>Language:</label>
          <select 
            value={selectedLanguage} 
            onChange={(e) => handleLanguageChange(e.target.value)}
            disabled={isListening}
          >
            {supportedLanguages.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* Audio visualizer */}
        <div className="audio-visualizer">
          {voiceVisualizer.map((level, index) => (
            <div 
              key={index}
              className="visualizer-bar"
              style={{ 
                height: `${Math.max(level * 100, 2)}%`,
                opacity: level > 0.1 ? 1 : 0.3
              }}
            />
          ))}
        </div>

        {/* Recording status */}
        <div className={`recording-status ${isListening ? 'listening' : ''}`}>
          {isListening ? (
            <>
              <div className="pulse-indicator"></div>
              <span>Listening... Speak now</span>
            </>
          ) : isProcessing ? (
            <>
              <div className="processing-indicator"></div>
              <span>Processing your request...</span>
            </>
          ) : (
            <span>Click the microphone to start</span>
          )}
        </div>

        {/* Transcript display */}
        <div className="transcript-container">
          <textarea
            className="transcript-display"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Your voice input will appear here..."
            disabled={isListening}
          />
          
          {confidence > 0 && (
            <div className="confidence-meter">
              Confidence: {Math.round(confidence * 100)}%
            </div>
          )}
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="error-message">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Controls */}
        <div className="voice-controls">
          <button 
            className={`mic-button ${isListening ? 'listening' : ''}`}
            onClick={isListening ? stopListening : startListening}
            disabled={isProcessing}
          >
            {isListening ? '🔴 Stop' : '🎤 Start'}
          </button>
          
          <button 
            className="submit-button"
            onClick={handleManualSubmit}
            disabled={!transcript.trim() || isListening || isProcessing}
          >
            📤 Send
          </button>
        </div>

        {/* Quick voice commands */}
        <div className="quick-commands">
          <h4>Try saying:</h4>
          <div className="command-examples">
            <span>&quot;Play some workout music&quot;</span>
            <span>&quot;Create a chill playlist&quot;</span>
            <span>&quot;I want upbeat songs&quot;</span>
            <span>&quot;Recommend jazz music&quot;</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceInterface;