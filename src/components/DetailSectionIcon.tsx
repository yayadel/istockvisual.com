import type { ReactNode } from 'react';

type IconName = 'info' | 'spark' | 'tip' | 'palette' | 'prompt';

function IconSvg({ children }: { children: ReactNode }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.55"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

const icons: Record<IconName, JSX.Element> = {
	info: (
		<IconSvg>
			<rect x="6" y="3.5" width="12" height="17" rx="2" />
			<path d="M9 8.5h6M9 12.5h6M9 16.5h3.5" />
		</IconSvg>
	),
	spark: (
		<IconSvg>
			<path d="M12 3.5 13.2 9l5.8 1.2L13.2 11.4 12 16.9l-1.2-5.5L5 10.2 10.8 9 12 3.5Z" />
			<path d="M18.2 14.8 18.7 17l2.2.5-2.2.5-.5 2.2-.5-2.2-2.2-.5 2.2-.5.5-2.2Z" />
		</IconSvg>
	),
	tip: (
		<IconSvg>
			<path d="M9 18h6M10 21h4" />
			<path d="M8.2 15.2A6 6 0 1 1 15.8 15.2c-.7.6-1.2 1.4-1.3 2.3H9.5c-.1-.9-.6-1.7-1.3-2.3Z" />
		</IconSvg>
	),
	palette: (
		<IconSvg>
			<path d="M12 3.5c-4.7 0-8.5 3.7-8.5 8.4 0 3.5 2.8 6.6 6.6 6.6.7 0 1.3-.6 1.3-1.3 0-.3-.1-.6-.3-.9-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.6c2.6 0 4.8-1.9 4.8-4.6 0-3.1-3.5-4.9-8-4.9Z" />
			<circle cx="8.2" cy="10.6" r="0.85" fill="currentColor" stroke="none" />
			<circle cx="11.1" cy="7.8" r="0.85" fill="currentColor" stroke="none" />
			<circle cx="15" cy="8.1" r="0.85" fill="currentColor" stroke="none" />
			<circle cx="16.8" cy="11.3" r="0.85" fill="currentColor" stroke="none" />
		</IconSvg>
	),
	prompt: (
		<IconSvg>
			<path d="M4.8 19.2 13 11" />
			<path d="M14.8 4.5 13.7 7.6 10.6 8.7l3.1 1.1 1.1 3.1 1.1-3.1 3.1-1.1-3.1-1.1-1.1-3.1Z" />
			<path d="M6.4 9.2 7 10.8l1.6.6L7 12l-.6 1.6L5.8 12l-1.6-.6 1.6-.6.6-1.6Z" />
		</IconSvg>
	),
};

export default function DetailSectionIcon({ name }: { name: IconName }) {
	return (
		<span className="detail-heading__icon" aria-hidden="true">
			{icons[name]}
		</span>
	);
}
