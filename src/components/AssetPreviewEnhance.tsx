import { useCallback, useEffect, useState, type ComponentType, type MouseEvent } from 'react';

type ToolId = 'adjust' | 'transform' | 'remove-bg' | 'expand' | 'pick-color';

const TOOL_LINKS: { id: ToolId; href: string; label: string; hint: string }[] = [
	{ id: 'adjust', href: '#edit-adjust', label: 'Adjust', hint: 'Color and light' },
	{ id: 'transform', href: '#edit-crop', label: 'Crop', hint: 'Aspect, crop, and rotate' },
	{ id: 'remove-bg', href: '#edit-remove-bg', label: 'Remove BG', hint: 'Cut out the subject' },
	{ id: 'expand', href: '#edit-expand', label: 'Expand', hint: 'Extend the canvas' },
	{ id: 'pick-color', href: '#edit-pick-color', label: 'Pick Color', hint: 'Sample any pixel' },
];

const HASH_TO_TOOL: Record<string, ToolId> = {
	'edit-adjust': 'adjust',
	'edit-crop': 'transform',
	'edit-remove-bg': 'remove-bg',
	'edit-expand': 'expand',
	'edit-pick-color': 'pick-color',
};

type Props = {
	imageUrl: string;
	title: string;
	loggedIn?: boolean;
	isPro?: boolean;
	assetId?: string;
};

function toolFromHash(hash: string): ToolId | null {
	const id = hash.replace(/^#/, '');
	return HASH_TO_TOOL[id] ?? null;
}

export default function AssetPreviewEnhance({
	imageUrl,
	title,
	loggedIn = false,
	isPro = false,
	assetId,
}: Props) {
	const [editing, setEditing] = useState(false);
	const [tool, setTool] = useState<ToolId>('adjust');
	const [Editor, setEditor] = useState<ComponentType<{
		imageUrl: string;
		title: string;
		onClose: () => void;
		loggedIn?: boolean;
		isPro?: boolean;
		assetId?: string;
		variant?: 'modal' | 'page' | 'inline';
		activeTool?: ToolId;
		onToolChange?: (next: ToolId) => void;
	}> | null>(null);

	useEffect(() => {
		const figure = document.querySelector('.asset-preview');
		figure?.classList.toggle('asset-preview--editing', editing);
		return () => figure?.classList.remove('asset-preview--editing');
	}, [editing]);

	const closeEditor = useCallback(() => {
		setEditing(false);
		if (toolFromHash(window.location.hash)) {
			history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
		}
	}, []);

	const openTool = useCallback((next: ToolId) => {
		setTool(next);
		void import('./ImageEditor').then((mod) => {
			setEditor(() => mod.default);
			setEditing(true);
		});
	}, []);

	useEffect(() => {
		const fromHash = toolFromHash(window.location.hash);
		if (fromHash) openTool(fromHash);
		const onHash = () => {
			const next = toolFromHash(window.location.hash);
			if (next) openTool(next);
			else setEditing(false);
		};
		const onOpen = (event: Event) => {
			const next = (event as CustomEvent<{ tool?: ToolId }>).detail?.tool ?? 'transform';
			openTool(next);
		};
		window.addEventListener('hashchange', onHash);
		window.addEventListener('stockvisual:open-editor', onOpen);
		window.addEventListener('istockvisual:open-editor', onOpen);
		return () => {
			window.removeEventListener('hashchange', onHash);
			window.removeEventListener('stockvisual:open-editor', onOpen);
			window.removeEventListener('istockvisual:open-editor', onOpen);
		};
	}, [openTool]);

	const onToolClick = (event: MouseEvent<HTMLAnchorElement>, next: ToolId) => {
		event.preventDefault();
		openTool(next);
		history.replaceState(null, '', event.currentTarget.getAttribute('href') || `#edit-${next}`);
	};

	return (
		<>
			{editing && Editor ? (
				<Editor
					imageUrl={imageUrl}
					title={title}
					onClose={closeEditor}
					loggedIn={loggedIn}
					isPro={isPro}
					assetId={assetId}
					variant="inline"
					activeTool={tool}
					onToolChange={setTool}
				/>
			) : null}
			<div className="asset-preview__footer" hidden={editing}>
				<div className="asset-preview__edit-wrap">
					<nav className="asset-preview__tools" aria-label="Edit this image" hidden={editing}>
						<p className="asset-preview__tools-lead">
							Edit on this image, then download:{' '}
							{TOOL_LINKS.map((item, index) => (
								<span key={item.id}>
									<a
										id={item.href.slice(1)}
										href={item.href}
										title={item.hint}
										onClick={(event) => onToolClick(event, item.id)}
									>
										{item.label}
									</a>
									{index < TOOL_LINKS.length - 1 ? <span aria-hidden="true"> · </span> : null}
								</span>
							))}
						</p>
					</nav>
				</div>
			</div>
		</>
	);
}
