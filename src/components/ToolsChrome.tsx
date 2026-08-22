import { type CSSProperties, type ReactNode, type RefObject } from 'react';

type ToolsDropzoneProps = {
	title: string;
	hint: string;
	cta?: string;
	accept?: string;
	multiple?: boolean;
	sampleSrc?: string;
	sampleLabel?: string;
	formats?: string[];
	inputRef?: RefObject<HTMLInputElement | null>;
	onFiles: (files: FileList | null) => void;
};

export const TOOLS_SAMPLE_SRC = '/demo/studio-orb.jpg';

export function ToolsDropzone({
	title,
	hint,
	cta = 'Browse files',
	accept = 'image/*',
	multiple = false,
	sampleSrc = TOOLS_SAMPLE_SRC,
	sampleLabel = 'Sample',
	formats = ['JPG', 'PNG', 'WebP'],
	inputRef,
	onFiles,
}: ToolsDropzoneProps) {
	return (
		<label
			className="tools-drop"
			onDragOver={(event) => {
				event.preventDefault();
				event.currentTarget.classList.add('is-dragover');
			}}
			onDragLeave={(event) => {
				event.currentTarget.classList.remove('is-dragover');
			}}
			onDrop={(event) => {
				event.preventDefault();
				event.currentTarget.classList.remove('is-dragover');
				onFiles(event.dataTransfer.files);
			}}
		>
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				multiple={multiple}
				hidden
				onChange={(event) => onFiles(event.currentTarget.files)}
			/>
			<figure className="tools-drop__visual">
				<img src={sampleSrc} alt="" />
				<figcaption>{sampleLabel}</figcaption>
			</figure>
			<div className="tools-drop__body">
				<p className="tools-drop__kicker">Drop zone</p>
				<strong className="tools-drop__title">{title}</strong>
				<span className="tools-drop__hint">{hint}</span>
				<ul className="tools-drop__formats" aria-label="Supported formats">
					{formats.map((format) => (
						<li key={format}>{format}</li>
					))}
				</ul>
			</div>
			<span className="tools-drop__cta">{cta}</span>
		</label>
	);
}

type ToolsPanelProps = {
	title: string;
	note?: string;
	sampleSrc?: string;
	sampleCaption?: string;
	/** Live preview node (canvas etc.). Replaces the static sample image when set. */
	sample?: ReactNode;
	children: ReactNode;
	actions?: ReactNode;
	/** When true, sample column is hidden and body spans full width (e.g. live editor). */
	flush?: boolean;
};

export function ToolsPanel({
	title,
	note,
	sampleSrc = TOOLS_SAMPLE_SRC,
	sampleCaption = 'Live example',
	sample,
	children,
	actions,
	flush = false,
}: ToolsPanelProps) {
	return (
		<section className={`tools-panel${flush ? ' tools-panel--flush' : ''}`} aria-label={title}>
			<header className="tools-panel__head">
				<div>
					<h2>{title}</h2>
					{note ? <p>{note}</p> : null}
				</div>
				{actions ? <div className="tools-panel__head-actions">{actions}</div> : null}
			</header>
			<div className="tools-panel__layout">
				{!flush &&
					(sample ?? (
						<figure className="tools-panel__sample">
							<img src={sampleSrc} alt="" />
							<figcaption>{sampleCaption}</figcaption>
						</figure>
					))}
				<div className="tools-panel__body">{children}</div>
			</div>
		</section>
	);
}

type ToolsEditorShellProps = {
	note: string;
	resetLabel?: string;
	onReset?: () => void;
	actions?: ReactNode;
	controls?: ReactNode;
	controlsLabel?: string;
	stageLabel?: string;
	children: ReactNode;
	editorRef?: RefObject<HTMLDivElement | null>;
	stageStyle?: CSSProperties;
};

/** Same chrome as `/tools/image` — status bar + sidebar rail + main stage. */
export function ToolsEditorShell({
	note,
	resetLabel,
	onReset,
	actions,
	controls,
	controlsLabel = 'Tool settings',
	stageLabel = 'Preview',
	children,
	editorRef,
	stageStyle,
}: ToolsEditorShellProps) {
	return (
		<div className="tools-editor" ref={editorRef}>
			<div className="tools-editor__bar">
				<p className="tools-editor__note">{note}</p>
				<div className="tools-editor__bar-actions">
					{onReset && resetLabel ? (
						<button type="button" className="tools-editor__link" onClick={onReset}>
							{resetLabel}
						</button>
					) : null}
					{actions}
				</div>
			</div>
			<div className={`tools-editor__workspace${controls ? '' : ' tools-editor__workspace--solo'}`}>
				{controls ? (
					<aside className="tools-editor__rail" aria-label={controlsLabel}>
						{controls}
					</aside>
				) : null}
				<div className="tools-editor__stage" aria-label={stageLabel} style={stageStyle}>
					{children}
				</div>
			</div>
		</div>
	);
}
