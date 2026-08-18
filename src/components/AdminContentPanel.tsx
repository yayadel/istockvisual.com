import { useCallback, useEffect, useState } from 'react';

type ContentRow = {
	id: string;
	keywordId: number | null;
	keyword: string;
	title: string;
	category: string;
	slug: string;
	publishedAt: string;
	createdAt: string;
};

type ListResponse = {
	items: ContentRow[];
	page: number;
	limit: number;
	total: number;
	totalPages: number;
};

export default function AdminContentPanel() {
	const [q, setQ] = useState('');
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [data, setData] = useState<ListResponse | null>(null);
	const [pending, setPending] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setPending(true);
		setError(null);
		try {
			const params = new URLSearchParams({ page: String(page), limit: '50' });
			if (search) params.set('q', search);

			const res = await fetch(`/api/admin/content?${params}`);
			const json = (await res.json()) as ListResponse & { error?: string };
			if (!res.ok) throw new Error(json.error || 'Failed to load content');
			setData(json);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load');
		} finally {
			setPending(false);
		}
	}, [page, search]);

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
					placeholder="Search title, keyword, slug…"
					value={q}
					onChange={(e) => setQ(e.target.value)}
				/>
				<button className="btn btn--primary" type="submit">
					Search
				</button>
			</form>

			{error && <p className="admin-error">{error}</p>}
			{pending && !data && <p className="hint">Loading content…</p>}

			{data && (
				<>
					<p className="hint">
						Page {data.page} of {data.totalPages} · {data.total.toLocaleString()} generated assets
					</p>
					<div className="admin-table-wrap">
						<table className="admin-table">
							<thead>
								<tr>
									<th>Title</th>
									<th>Keyword</th>
									<th>Category</th>
									<th>Published</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{data.items.map((row) => (
									<tr key={row.id}>
										<td>{row.title}</td>
										<td>
											{row.keywordId ? (
												<a href={`/admin/keywords?q=${encodeURIComponent(row.keyword)}`}>
													{row.keyword}
												</a>
											) : (
												row.keyword || '—'
											)}
										</td>
										<td>{row.category}</td>
										<td>{row.publishedAt ? new Date(row.publishedAt).toLocaleString() : '—'}</td>
										<td>
											<a href={`/${row.category}/${row.slug}`}>View</a>
											{' · '}
											<a href={`/preview/${encodeURIComponent(row.id)}_1000w.jpg`} target="_blank" rel="noreferrer">
												Preview
											</a>
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
