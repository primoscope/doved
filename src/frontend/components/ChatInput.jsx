// React is needed for JSX
import { useState, useRef, useEffect } from 'react';

function ChatInput({ onSendMessage, disabled, placeholder }) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
  };

  return (
    <form className="chat-input-form" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className="chat-input"
        value={message}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows="1"
        disabled={disabled}
      />
      <button 
        type="submit" 
        className="send-button"
        disabled={disabled || !message.trim()}
      >
        <span className={`loading ${disabled ? '' : 'hidden'}`}></span>
        <span className="send-text">
          {disabled ? 'Thinking...' : 'Send'}
        </span>
      </button>
    </form>
  );
}

export default ChatInput;