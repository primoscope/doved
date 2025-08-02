// React is needed for JSX


function MessageList({ messages, isTyping, currentProvider }) {
  const formatMessage = (content) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 3px;">$1</code>')
      .replace(/\n/g, '<br>');
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="chat-messages">
      {messages.map((message) => (
        <div key={message.id} className={`message ${message.sender} fade-in`}>
          <div 
            className="message-content"
            dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
          />
          {message.sender !== 'system' && (
            <div className="message-time">
              {formatTime(message.timestamp)}
              {message.provider && message.sender === 'assistant' && (
                <span className="provider-badge">via {message.provider}</span>
              )}
            </div>
          )}
        </div>
      ))}
      
      {isTyping && <TypingIndicator provider={currentProvider} />}
    </div>
  );
}

function TypingIndicator({ provider }) {
  return (
    <div className="typing-indicator" id="typing-indicator">
      EchoTune is thinking
      <div className="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      {provider && (
        <span className="typing-provider">via {provider}</span>
      )}
    </div>
  );
}

export default MessageList;