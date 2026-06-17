import { useState, useRef, useEffect } from 'react';
import { Send, X, MessageCircle, Minimize2 } from 'lucide-react';
import { chatMessages, chatSuggestions } from '../data/mockData';
import ReactMarkdown from 'react-markdown';

const simulatedResponses = {
  default: '¡Claro! Basándome en los datos de tu empresa, aquí tienes la información que buscas. ¿Hay algo más en lo que pueda ayudarte?',
  gasto: 'En junio 2026, el total de gastos fue de **$834,200 MXN**. El rubro más alto fue Servicios Profesionales con $312,000, seguido de Nómina con $220,000.',
  mes: 'El resumen de junio 2026 es:\n\n• **Ingresos**: $1,240,500 MXN (+12.4%)\n• **Gastos**: $834,200 MXN (-3.8%)\n• **Balance neto**: $406,300 MXN (+28.1%)',
  cobrar: 'Actualmente tienes **2 facturas por cobrar**:\n\n1. Microsoft de México — $58,000 MXN (F-00421)\n2. CLIENTE BETA — $290,000 USD (VTA-1106)\n\nTotal pendiente: $348,000 MXN aprox.',
  proveedor: 'Los 3 principales proveedores de junio son:\n\n1. **Servicios Contables Monterrey** — $23,200 MXN\n2. **Renta Oficinas Centro** — $34,800 MXN\n3. **Microsoft de México** — $58,000 MXN',
  balance: 'Comparado con mayo 2026:\n\n• Mayo: Balance $380,000 MXN\n• Junio: Balance $406,300 MXN\n• **Mejora: +$26,300 MXN (+6.9%)**',
};

function getResponse(message) {
  const lower = message.toLowerCase();
  if (lower.includes('gast')) return simulatedResponses.gasto;
  if (lower.includes('mes') || lower.includes('resumen')) return simulatedResponses.mes;
  if (lower.includes('cobrar') || lower.includes('pendiente')) return simulatedResponses.cobrar;
  if (lower.includes('proveedor') || lower.includes('top')) return simulatedResponses.proveedor;
  if (lower.includes('balance') || lower.includes('anterior')) return simulatedResponses.balance;
  return simulatedResponses.default;
}

function TypingIndicator() {
  return (
    <div className="chat-msg assistant" style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '10px 16px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7,
          background: 'var(--text-tertiary)',
          borderRadius: '50%',
          animation: `typingBounce 1s ease ${i * 0.15}s infinite`,
        }} />
      ))}
      <style>{`
        @keyframes typingBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function ChatWidget({ userEmail }) {
  const [open, setOpen] = useState(false);
  
  // Initialize message dynamically
  const initialMessage = (() => {
    const emailStr = userEmail || "usuario@gmail.com";
    const nombreUsuario = emailStr.split('@')[0];
    return {
      id: '1',
      role: 'assistant',
      content: `¡Hola, ${nombreUsuario}! 👋 Soy tu Asistente Fiscal de Fiscally. Puedo responder preguntas sobre tus facturas, gastos, ingresos y más. ¿En qué puedo ayudarte hoy?`,
      time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    };
  })();

  const [messages, setMessages] = useState([initialMessage]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { if (open) scrollBottom(); }, [messages, open, typing]);

  const sendMessage = (text) => {
    const msg = text || input.trim();
    if (!msg) return;
    setInput('');

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, userMsg]);
    setTyping(true);

    setTimeout(() => {
      setTyping(false);
      const response = getResponse(msg);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      }]);
    }, 1200 + Math.random() * 600);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)} title="Asistente Fiscal IA">
        <MessageCircle size={22} />
        <span style={{
          position: 'absolute',
          top: -2, right: -2,
          width: 14, height: 14,
          background: 'var(--danger-dot)',
          borderRadius: '50%',
          border: '2px solid white',
          fontSize: '0.55rem', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white',
        }}>1</span>
      </button>
    );
  }

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-avatar">🤖</div>
        <div style={{ flex: 1 }}>
          <div className="chat-title">Asistente Fiscal</div>
          <div className="chat-subtitle">
            <span className="chat-online-dot" />
            Disponible · Gemini Flash
          </div>
        </div>
        <button className="icon-btn btn" onClick={() => setOpen(false)}>
          <Minimize2 size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div className={`chat-msg ${msg.role}`}>
              <div style={{ lineHeight: 1.5, wordBreak: 'break-word' }}>
                <ReactMarkdown
                  components={{
                    p: ({node, ...props}) => <p style={{ margin: '0 0 0.5em 0' }} {...props} />,
                    ul: ({node, ...props}) => <ul style={{ margin: '0 0 0.5em 1.2em', padding: 0 }} {...props} />,
                    ol: ({node, ...props}) => <ol style={{ margin: '0 0 0.5em 1.2em', padding: 0 }} {...props} />,
                    li: ({node, ...props}) => <li style={{ margin: '0.2em 0' }} {...props} />,
                    strong: ({node, ...props}) => <strong style={{ fontWeight: 600 }} {...props} />
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
            <div className="chat-msg-time" style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem', margin: '2px 4px' }}>
              {msg.time}
            </div>
          </div>
        ))}
        {typing && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="chat-suggestions">
          {chatSuggestions.map((s, i) => (
            <button key={i} className="chat-suggestion-chip" onClick={() => sendMessage(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={1}
          placeholder="Pregunta sobre tus finanzas..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn btn-primary btn-sm btn-icon"
          style={{ borderRadius: 'var(--radius-md)', height: 34, width: 34, flexShrink: 0 }}
          onClick={() => sendMessage()}
          disabled={!input.trim() && !typing}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
