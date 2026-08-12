import { useRef, useState } from 'react';

const ACTIONS = [
	{ id: 'crop', label: 'Smart crop' },
	{ id: 'bg', label: 'Remove background' },
	{ id: 'enhance', label: 'Enhance' },
	{ id: 'upscale', label: 'Upscale' },
] as const;

export default function AiEditPanel() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [fileName, setFileName] = useState<string | null>(null);
	const [notice, setNotice] = useState('Upload an image to preview. AI actions are placeholders for Workers AI / third-party APIs.');

	function onFile(file: File | undefined) {
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			setNotice('Please choose an image file.');
			return;
		}
		const url = URL.createObjectURL(file);
		setPreview(url);
		setFileName(file.name);
		setNotice('Preview ready. Connect a model backend to enable edits.');
	}

	return (
		<div className="tool-layout">
			<div className="tool-stage">
				{preview ? (
					<img src={preview} alt={fileName ?? 'Upload preview'} style={{ maxHeight: 420, width: 'auto', margin: '0 auto' }} />
				) : (
					<div>
						<p>Drop an image or choose a file</p>
						<button className="btn btn--ghost" type="button" onClick={() => inputRef.current?.click()}>
							Choose image
						</button>
					</div>
				)}
				<input
					ref={inputRef}
					type="file"
					accept="image/*"
					hidden
					onChange={(e) => onFile(e.target.files?.[0])}
				/>
			</div>
			<div className="tool-panel" style={{ margin: 0, width: '100%' }}>
				<h1>AI Edit</h1>
				<p className="hint">{notice}</p>
				<div className="tool-actions" style={{ marginTop: '1rem' }}>
					<button className="btn btn--ghost" type="button" onClick={() => inputRef.current?.click()}>
						{preview ? 'Replace image' : 'Upload image'}
					</button>
					{ACTIONS.map((action) => (
						<button key={action.id} className="btn btn--primary" type="button" disabled title="Coming soon">
							{action.label} (soon)
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
