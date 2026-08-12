import { useState } from 'react';

type PrepareResponse = {
	ok: boolean;
	keywordId?: number;
	keyword?: string;
	geminiConfigured?: boolean;
	instructions?: string[];
	error?: string;
};

export default function GenerateAssetPanel() {
	const [pending, setPending] = useState(false);
	const [prepared, setPrepared] = useState<PrepareResponse | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function onPrepare() {
		setPending(true);
		setError(null);
		setPrepared(null);

		try {
			const res = await fetch('/api/generate/prepare', {
				method: 'POST',
				headers: { 'x-generate-secret': 'dev-generate-secret' },
			});
			const data = (await res.json()) as PrepareResponse;
			if (!res.ok) throw new Error(data.error || 'Prepare failed');
			setPrepared(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Prepare failed');
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="tool-layout">
			<div className="tool-panel" style={{ margin: 0, width: '100%' }}>
				<h1>Generate stock asset</h1>
				<p className="hint">
					Step 1 metadata uses <strong>Google Gemini</strong> via{' '}
					<code>npm run agent:meta</code> (reads <code>GEMINI_API_KEY</code> from{' '}
					<code>.dev.vars</code>). Images use Cursor — one asset at a time.
				</p>

				<ol className="hint" style={{ paddingLeft: '1.2rem', lineHeight: 1.7 }}>
					<li>
						Run <code>npm run agent:meta</code> (reserves keyword + Gemini JSON meta).
					</li>
					<li>Generate ONE image from <code>imagePrompt</code> in Cursor.</li>
					<li>Import with <code>node scripts/agent-import.mjs …</code>.</li>
				</ol>

				<div className="tool-actions" style={{ marginTop: '1rem' }}>
					<button
						className="btn btn--primary"
						type="button"
						onClick={onPrepare}
						disabled={pending}
					>
						{pending ? 'Reserving…' : 'Reserve keyword only'}
					</button>
				</div>

				{error && (
					<p className="hint" style={{ color: '#b42318', marginTop: '1rem' }}>
						{error}
					</p>
				)}

				{prepared?.keyword && (
					<div className="generate-result" style={{ marginTop: '1.5rem' }}>
						<p>
							<strong>Keyword ID:</strong> {prepared.keywordId}
						</p>
						<p>
							<strong>Keyword:</strong> {prepared.keyword}
						</p>
						<p className="hint" style={{ marginTop: '0.75rem' }}>
							{prepared.geminiConfigured
								? `Next: npm run agent:meta -- ${prepared.keywordId} "${prepared.keyword}"`
								: 'Add GEMINI_API_KEY to .dev.vars, then run npm run agent:meta.'}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
