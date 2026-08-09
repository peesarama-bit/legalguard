import { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  MessageCircle,
  User,
  TrendingUp,
  AlertTriangle,
  Handshake,
  Receipt,
} from 'lucide-react';
import { askBusiness } from '@/lib/api';

type Message = {
  role: 'user' | 'ai';
  content: string;
};

const suggestedQuestions = [
  { icon: TrendingUp, text: 'Which clients are most at risk?' },
  { icon: AlertTriangle, text: 'Why has Acme Studio not paid?' },
  { icon: Handshake, text: 'What payment promises are pending?' },
  { icon: Receipt, text: 'How much is overdue across all invoices?' },
];

export default function AskAI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function sendQuestion(question: string) {
    const q = question.trim();
    if (!q || loading) return;

    setError(null);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const result = await askBusiness(q);
      setMessages((prev) => [...prev, { role: 'ai', content: result.answer }]);
    } catch (e) {
      setError((e as Error).message);
      setMessages((prev) => [...prev, { role: 'ai', content: 'Sorry, I could not process that question. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendQuestion(input);
  }

  return (
    <div className="animate-fade-in flex flex-col" style={{ minHeight: 'calc(100vh - 160px)' }}>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">Ask My Business</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Ask questions about your contracts, invoices, clients, and payments. The AI has full context of your business data.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</div>
      )}

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100">
              <Sparkles className="h-7 w-7 text-primary-600" />
            </div>
            <p className="mt-4 text-sm font-semibold text-ink-700">Ask me anything about your business</p>
            <p className="mt-1 text-xs text-ink-400">I can see your contracts, invoices, clients, and payment promises</p>

            <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
              {suggestedQuestions.map((sq, i) => {
                const Icon = sq.icon;
                return (
                  <button key={i} onClick={() => sendQuestion(sq.text)}
                    className="group flex items-center gap-3 rounded-xl border border-ink-200 p-3.5 text-left transition hover:border-primary-300 hover:bg-primary-50/50">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500 transition group-hover:bg-primary-100 group-hover:text-primary-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium text-ink-700">{sq.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  msg.role === 'user' ? 'bg-ink-100 text-ink-600' : 'bg-primary-600 text-white'
                }`}>
                  {msg.role === 'user' ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-ink-900 text-white'
                    : 'bg-ink-50 text-ink-800'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="rounded-2xl bg-ink-50 px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-ink-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-ink-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-ink-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input bar */}
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <MessageCircle className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your business…"
            disabled={loading}
            className="w-full rounded-xl border border-ink-200 bg-white py-3 pl-10 pr-4 text-sm text-ink-800 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
          />
        </div>
        <button type="submit" disabled={loading || !input.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
