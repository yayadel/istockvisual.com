import { useEffect, useRef, useState } from 'react';

type ChatItem = { role: 'user' | 'assistant'; content: string };

type Props = {
	variant?: 'page' | 'widget';
};

type StoredChat = {
	updatedAt: number;
	open?: boolean;
	messages: ChatItem[];
};

const GREETING =
	'Hi — I’m the iStockVisual assistant. Ask about licenses, Pro sizes, plans, refunds, or studio tools. For account-specific billing, email hello@istockvisual.com.';

const PROMPTS = [
	'Is 1K really free?',
	'How do I credit an image?',
	'What does Pro include?',
	'How do refunds work?',
];

const STORAGE_KEY = 'istockvisual-support-chat';
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STORED = 40;
const DEFAULT_MESSAGES: ChatItem[] = [{ role: 'assistant', content: GREETING }];

function isChatItem(value: unknown): value is ChatItem {
	if (!value || typeof value !== 'object') return false;
	const item = value as ChatItem;
	return (
		(item.role === 'user' || item.role === 'assistant') &&
		typeof item.content === 'string' &&
		item.content.trim().length > 0
	);
}

function readStore(): StoredChat | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const data = JSON.parse(raw) as StoredChat;
		if (!data?.updatedAt || Date.now() - data.updatedAt > TTL_MS) {
			localStorage.removeItem(STORAGE_KEY);
			return null;
		}
		const messages = Array.isArray(data.messages)
			? data.messages.filter(isChatItem).slice(-MAX_STORED)
			: [];
		if (!messages.some((item) => item.role === 'user')) {
			localStorage.removeItem(STORAGE_KEY);
			return null;
		}
		return { updatedAt: data.updatedAt, open: Boolean(data.open), messages };
	} catch {
		return null;
	}
}

function writeStore(messages: ChatItem[], open: boolean) {
	try {
		if (!messages.some((item) => item.role === 'user')) {
			localStorage.removeItem(STORAGE_KEY);
			return;
		}
		const payload: StoredChat = {
			updatedAt: Date.now(),
			open,
			messages: messages.filter(isChatItem).slice(-MAX_STORED),
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch {
		/* quota / private mode */
	}
}

function linkify(text: string) {
	const parts = text.split(/(\/[a-z0-9][a-z0-9/_-]*)/gi);
	return parts.map((part, index) => {
		if (/^\/[a-z0-9][a-z0-9/_-]*$/i.test(part)) {
			return (
				<a key={`${part}-${index}`} href={part}>
					{part}
				</a>
			);
		}
		return <span key={index}>{part}</span>;
	});
}

export default function SupportChat({ variant = 'page' }: Props) {
	const [open, setOpen] = useState(variant === 'page');
	const [input, setInput] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [ready, setReady] = useState(false);
	const [messages, setMessages] = useState<ChatItem[]>(DEFAULT_MESSAGES);
	const scrollerRef = useRef<HTMLDivElement>(null);
	const skipWriteRef = useRef(true);

	useEffect(() => {
		const stored = readStore();
		if (stored) {
			setMessages(stored.messages);
			if (variant === 'widget') setOpen(stored.open);
		}
		setReady(true);
	}, [variant]);

	useEffect(() => {
		if (!ready) return;
		if (skipWriteRef.current) {
			skipWriteRef.current = false;
			return;
		}
		writeStore(messages, variant === 'page' ? true : open);
	}, [ready, messages, open, variant]);

	useEffect(() => {
		function onStorage(event: StorageEvent) {
			if (event.key !== STORAGE_KEY) return;
			const stored = readStore();
			if (stored) {
				setMessages(stored.messages);
				if (variant === 'widget') setOpen(stored.open);
			} else {
				setMessages(DEFAULT_MESSAGES);
			}
		}
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	}, [variant]);

	useEffect(() => {
		const el = scrollerRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages, open, busy]);

	async function send(text: string) {
		const content = text.trim();
		if (!content || busy) return;
		const next = [...messages, { role: 'user' as const, content }];
		setMessages(next);
		setInput('');
		setBusy(true);
		setError('');
		try {
			const res = await fetch('/api/support/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messages: next }),
			});
			const data = (await res.json()) as { reply?: string; error?: string };
			if (!res.ok || !data.reply) throw new Error(data.error || 'Could not answer that.');
			setMessages([...next, { role: 'assistant', content: data.reply }]);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Could not answer that.';
			setError(message);
			setMessages([
				...next,
				{
					role: 'assistant',
					content: 'I could not reach the assistant just now. Try again, or email hello@istockvisual.com.',
				},
			]);
		} finally {
			setBusy(false);
		}
	}

	const panel = (
		<div className={`support-chat${variant === 'widget' ? ' support-chat--widget' : ''}`}>
			<div className="support-chat__head">
				<div>
					<p className="support-chat__eyebrow">Site assistant</p>
					<strong>Ask iStockVisual</strong>
				</div>
				{variant === 'widget' && (
					<button type="button" className="support-chat__icon-btn" aria-label="Close chat" onClick={() => setOpen(false)}>
						×
					</button>
				)}
			</div>
			<div className="support-chat__log" ref={scrollerRef}>
				{messages.map((item, index) => (
					<div key={`${item.role}-${index}`} className={`support-chat__bubble support-chat__bubble--${item.role}`}>
						{linkify(item.content)}
					</div>
				))}
				{busy && <p className="support-chat__status">Thinking…</p>}
				{error && !busy && <p className="support-chat__status">{error}</p>}
			</div>
			{messages.length < 3 && (
				<div className="support-chat__prompts">
					{PROMPTS.map((prompt) => (
						<button key={prompt} type="button" onClick={() => send(prompt)}>
							{prompt}
						</button>
					))}
				</div>
			)}
			<form
				className="support-chat__form"
				onSubmit={(event) => {
					event.preventDefault();
					send(input);
				}}
			>
				<label className="visually-hidden" htmlFor={`support-input-${variant}`}>
					Your question
				</label>
				<input
					id={`support-input-${variant}`}
					value={input}
					maxLength={800}
					placeholder="Ask about license, sizes, plans…"
					onChange={(event) => setInput(event.target.value)}
					disabled={busy}
				/>
				<button className="btn btn--primary" type="submit" disabled={busy || !input.trim()}>
					Send
				</button>
			</form>
		</div>
	);

	if (variant === 'page') return panel;

	return (
		<div className="support-chat-dock">
			{open && panel}
			<button
				className="support-chat-launch"
				type="button"
				aria-expanded={open}
				aria-label="Open help chat"
				onClick={() => setOpen((value) => !value)}
			>
				<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
					<path
						d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H12l-4.2 3.2A.8.8 0 0 1 6.5 18.6V16H7.5A2.5 2.5 0 0 1 5 13.5v-7Z"
						stroke="currentColor"
						strokeWidth="1.7"
					/>
				</svg>
				Help
			</button>
		</div>
	);
}
