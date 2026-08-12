import { useCallback, useEffect, useState } from 'react';

type KeywordRow = {
	id: number;
	keyword: string;
	used: boolean;
	usedAt: string | null;
	createdAt: string;
	contentCount: number;
	primaryContent: {
		id: string;
		title: string;
		category: string;
		slug: string;
		publishedAt: string;
	} | null;
};

type ListResponse = {
	items: KeywordRow[];
	page: number;
	limit: number;
	total: number;
	totalPages: number;
};

const STATUS_OPTIONS = [
	{ value: 'all', label: 'All' },
	{ value: 'unused', label: 'Unused' },
	{ value: 'used', label: 'Used' },
	{ value: 'no_content', label: 'Used but no content' },
] as const;

export default function AdminKeywordsPanel() {
	const [q, setQ] = useState('');
	const [search, setSearch] = useState('');
	const [status, setStatus] = useState('all');
	const [page, setPage] = useState(1);
	const [data, setData] = useState<ListResponse | null>(null);
	const [pending, setPending] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setPending(true);
		setError(null);
		try {
			const params = new URLSearchParams({
				page: String(page),
				limit: '50',
				status,
			});
			if (search) params.set('q', search);

			const res = await fetch(`/api/admin/keywords?${params}`);
			const json = (await res.json()) as ListResponse & { error?: string };
			if (!res.ok) throw new Error(json.error || 'Failed to load keywords');
			setData(json);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load');
		} finally {
			setPending(false);
		}
	}, [page, search, status]);

	useEffect(() => {
		void load();
	}, [load]);

	function onSearch(event: React.FormEvent) {
		event.preventDefault();
		setPage(1);
		setSearch(q.trim());
	}

	return (
		<div className="admin-panel">
			<form className="admin-toolbar" onSubmit={onSearch}>
				<input
					type="search"
					placeholder="Search keyword…"
					value={q}
					onChange={(e) => setQ(e.target.value)}
				/>
				<select
					value={status}
					onChange={(e) => {
						setStatus(e.target.value);
						setPage(1);
					}}
				>
					{STATUS_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
				<button className="btn btn--primary" type="submit">
					Search
				</button>
			</form>

			{error && <p className="admin-error">{error}</p>}
			{pending && !data && <p className="hint">Loading keywords…</p>}

			{data && (
				<>
					<p className="hint">
						Showing page {data.page} of {data.totalPages} · {data.total.toLocaleString()} total
					</p>
					<div className="admin-table-wrap">
						<table className="admin-table">
							<thead>
								<tr>
									<th>ID</th>
									<th>Keyword</th>
									<th>Status</th>
									<th>Used at</th>
									<th>Content</th>
									<th>Primary asset</th>
								</tr>
							</thead>
							<tbody>
								{data.items.map((row) => (
									<tr key={row.id}>
										<td>{row.id}</td>
										<td>{row.keyword}</td>
										<td>
											<span
												className={`admin-badge admin-badge--${
													row.used
														? row.contentCount > 0
															? 'used'
															: 'reserved'
														: 'unused'
												}`}
											>
												{row.used
													? row.contentCount > 0
														? 'Used'
														: 'Reserved'
													: 'Unused'}
											</span>
										</td>
										<td>{row.usedAt ? new Date(row.usedAt).toLocaleString() : '—'}</td>
										<td>{row.contentCount}</td>
										<td>
											{row.primaryContent ? (
												<a href={`/${row.primaryContent.category}/${row.primaryContent.slug}`}>
													{row.primaryContent.title}
												</a>
											) : (
												'—'
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<div className="admin-pagination">
						<button
							className="btn btn--ghost"
							type="button"
							disabled={page <= 1 || pending}
							onClick={() => setPage((p) => Math.max(1, p - 1))}
						>
							Previous
						</button>
						<span>
							Page {page} / {data.totalPages}
						</span>
						<button
							className="btn btn--ghost"
							type="button"
							disabled={page >= data.totalPages || pending}
							onClick={() => setPage((p) => p + 1)}
						>
							Next
						</button>
					</div>
				</>
			)}
		</div>
	);
}
