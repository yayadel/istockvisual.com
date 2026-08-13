import { useEffect, useState } from 'react';

const STORAGE_KEY = 'istockvisual-visual-search';

type StoredQuery = {
	name?: string;
	thumb?: string;
	colors?: string[];
};

export default function VisualSearchQuery({
	colors,
	previewUrl,
}: {
	colors: string[];
	previewUrl?: string | null;
}) {
	const [thumb, setThumb] = useState<string | null>(previewUrl || null);

	useEffect(() => {
		if (previewUrl) {
			setThumb(previewUrl);
			return;
		}
		try {
			const raw = sessionStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as StoredQuery;
			if (typeof parsed.thumb === 'string' && parsed.thumb.startsWith('data:image/')) {
				setThumb(parsed.thumb);
			}
		} catch {
			/* ignore */
		}
	}, [previewUrl]);

	return (
		<div className="upload-result">
			<div className="upload-result__meta">
				{thumb ? (
					<img className="upload-result__thumb" src={thumb} alt="" width={72} height={72} />
				) : null}
				<div>
					<p>
						<strong>Query photo is in a temporary folder</strong> and is removed after 1 hour.
						Library files are not touched.
					</p>
					{colors.length ? (
						<p className="upload-result__swatches">
							{colors.map((hex) => (
								<span
									key={hex}
									style={{ background: `#${hex}` }}
									title={`#${hex}`}
								/>
							))}
						</p>
					) : (
						<p>No colors could be read from that file.</p>
					)}
				</div>
			</div>
		</div>
	);
}
