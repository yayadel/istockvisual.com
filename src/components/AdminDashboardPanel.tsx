import { useEffect, useState } from 'react';

type Stats = {
	keywordsTotal: number;
	keywordsUnused: number;
	keywordsUsed: number;
	generatedAssets: number;
	activeLinks: number;
	usedWithoutContent: number;
};

export default function AdminDashboardPanel() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void (async () => {
			try {
				const res = await fetch('/api/admin/stats');
				const json = (await res.json()) as Stats & { error?: string };
				if (!res.ok) throw new Error(json.error || 'Failed to load stats');
				setStats(json);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load stats');
			}
		})();
	}, []);

	if (error) return <p className="admin-error">{error}</p>;
	if (!stats) return <p className="hint">Loading dashboard…</p>;

	const cards = [
		{ label: 'Keywords total', value: stats.keywordsTotal, href: '/admin/keywords' },
		{ label: 'Unused', value: stats.keywordsUnused, href: '/admin/keywords?status=unused' },
		{ label: 'Used', value: stats.keywordsUsed, href: '/admin/keywords?status=used' },
		{ label: 'Generated assets', value: stats.generatedAssets, href: '/admin/content' },
		{ label: 'Active links', value: stats.activeLinks, href: '/admin/keywords' },
		{ label: 'Reserved (no content)', value: stats.usedWithoutContent, href: '/admin/keywords?status=no_content' },
	];

	return (
		<div className="admin-stats">
			{cards.map((card) => (
				<a key={card.label} className="admin-stat-card" href={card.href}>
					<span>{card.label}</span>
					<strong>{card.value.toLocaleString()}</strong>
				</a>
			))}
		</div>
	);
}
