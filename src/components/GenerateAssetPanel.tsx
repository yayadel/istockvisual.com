import { useState } from 'react';

type GenerateResponse = {
	ok: boolean;
	keyword?: string;
	asset?: {
		id: string;
		title: string;
		slug: string;
		category: string;
		previewUrl?: string;
		pageUrl: string;
	};
	meta?: {
		imagePrompt?: string;
		imagePageTitle?: string;
	};
	error?: string;
};

export default function GenerateAssetPanel() {
	const [pending, setPending] = useState(false);
	const [result, setResult] = useState<GenerateResponse | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function onGenerate() {
		setPending(true);
		setError(null);
		setResult(null);

		try {
			const res = await fetch('/api/generate/asset', {
				method: 'POST',
				headers: {
					'x-generate-secret': 'dev-generate-secret',
				},
			});
			const data = (await res.json()) as GenerateResponse;
			if (!res.ok) {
				throw new Error(data.error || 'Generation failed');
			}
			setResult(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Generation failed');
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="tool-layout">
			<div className="tool-panel" style={{ margin: 0, width: '100%' }}>
				<h1>Generate stock asset</h1>
				<p className="hint">
					Picks the next unused keyword from D1, combines it with{' '}
					<code>host_prompt.txt</code>, asks the LLM for metadata + image prompt, then
					generates the image with Workers AI Flux and publishes a detail page.
				</p>

				<div className="tool-actions" style={{ marginTop: '1rem' }}>
					<button
						className="btn btn--primary"
						type="button"
						onClick={onGenerate}
						disabled={pending}
					>
						{pending ? 'Generating…' : 'Generate one asset'}
					</button>
				</div>

				{error && (
					<p className="hint" style={{ color: '#b42318', marginTop: '1rem' }}>
						{error}
					</p>
				)}

				{result?.asset && (
					<div className="generate-result" style={{ marginTop: '1.5rem' }}>
						<p>
							<strong>Keyword:</strong> {result.keyword}
						</p>
						<p>
							<strong>Title:</strong> {result.asset.title}
						</p>
						{result.meta?.imagePrompt && (
							<p>
								<strong>Image prompt:</strong> {result.meta.imagePrompt}
							</p>
						)}
						<div className="cta-row" style={{ marginTop: '1rem' }}>
							<a className="btn btn--primary" href={result.asset.pageUrl}>
								Open asset page
							</a>
							{result.asset.previewUrl && (
								<a className="btn btn--ghost" href={result.asset.previewUrl} target="_blank">
									Preview image
								</a>
							)}
						</div>
						{result.asset.previewUrl && (
							<img
								src={result.asset.previewUrl}
								alt={result.asset.title}
								style={{ marginTop: '1rem', maxWidth: '100%', borderRadius: 12 }}
							/>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
