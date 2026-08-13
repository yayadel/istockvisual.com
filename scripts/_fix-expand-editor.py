from pathlib import Path

path = Path(r'c:\Users\27820\Desktop\istockvisual.com\src\components\ImageEditor.tsx')
text = path.read_text(encoding='utf-8')

def replace_once(label: str, old: str, new: str) -> None:
	global text
	if old not in text:
		raise SystemExit(f'Missing block: {label}')
	text = text.replace(old, new, 1)
	print('ok', label)

replace_once(
	'setWorkingFromCanvas',
	'''\tconst setWorkingFromCanvas = useCallback(
\t\t(canvas: HTMLCanvasElement) => {
\t\t\tworkingRef.current = canvas;
\t\t\tsetNatural({ w: canvas.width, h: canvas.height });
\t\t\tlet next: string | null = null;
\t\t\ttry {
\t\t\t\tnext = canvas.toDataURL('image/png');
\t\t\t} catch {
\t\t\t\tnext = null;
\t\t\t}
\t\t\tif (next) {
\t\t\t\tsetPreviewUrl((prev) => {
\t\t\t\t\trevokeIfBlob(prev);
\t\t\t\t\treturn next!;
\t\t\t\t});
\t\t\t\treturn;
\t\t\t}
\t\t\tcanvas.toBlob((blob) => {
\t\t\t\tif (!blob) return;
\t\t\t\tconst url = URL.createObjectURL(blob);
\t\t\t\tsetPreviewUrl((prev) => {
\t\t\t\t\trevokeIfBlob(prev);
\t\t\t\t\treturn url;
\t\t\t\t});
\t\t\t}, 'image/png');
\t\t},
\t\t[revokeIfBlob],
\t);''',
	'''\tconst setWorkingFromCanvas = useCallback(
\t\t(canvas: HTMLCanvasElement) => {
\t\t\tworkingRef.current = canvas;
\t\t\tsetNatural({ w: canvas.width, h: canvas.height });
\t\t\tconst applyUrl = (url: string) => {
\t\t\t\tsetPreviewUrl((prev) => {
\t\t\t\t\trevokeIfBlob(prev);
\t\t\t\t\treturn url;
\t\t\t\t});
\t\t\t\tsetFrameUrl(url);
\t\t\t};
\t\t\tcanvas.toBlob(
\t\t\t\t(blob) => {
\t\t\t\t\tif (blob) {
\t\t\t\t\t\tapplyUrl(URL.createObjectURL(blob));
\t\t\t\t\t\treturn;
\t\t\t\t\t}
\t\t\t\t\ttry {
\t\t\t\t\t\tapplyUrl(canvas.toDataURL('image/jpeg', 0.92));
\t\t\t\t\t} catch (error) {
\t\t\t\t\t\tconsole.error(error);
\t\t\t\t\t\tsetStatus('Preview update failed. Try reloading the image.');
\t\t\t\t\t}
\t\t\t\t},
\t\t\t\t'image/jpeg',
\t\t\t\t0.92,
\t\t\t);
\t\t},
\t\t[revokeIfBlob],
\t);''',
)

replace_once(
	'load effect',
	'''\tuseEffect(() => {
\t\tlet cancelled = false;
\t\tconst img = new Image();
\t\timg.crossOrigin = 'anonymous';
\t\timg.onload = () => {
\t\t\tif (cancelled) return;
\t\t\tconst canvas = canvasFromImage(img, img.naturalWidth, img.naturalHeight);
\t\t\toriginalRef.current = cloneCanvas(canvas);
\t\t\tworkingRef.current = canvas;
\t\t\tsetNatural({ w: img.naturalWidth, h: img.naturalHeight });
\t\t\tsetExpandOrigin({ w: img.naturalWidth, h: img.naturalHeight });
\t\t\tsetPreviewUrl(imageUrl);
\t\t\tsetReady(true);
\t\t};
\t\timg.onerror = () => {
\t\t\tif (cancelled) return;
\t\t\tsetStatus('Failed to load image for editing.');
\t\t\tsetReady(true);
\t\t};
\t\timg.src = imageUrl;
\t\treturn () => {
\t\t\tcancelled = true;
\t\t};
\t}, [imageUrl]);''',
	'''\tuseEffect(() => {
\t\tlet cancelled = false;
\t\tlet objectUrl: string | null = null;

\t\tconst paintFromImage = (img: HTMLImageElement, preview: string) => {
\t\t\tconst canvas = canvasFromImage(img, img.naturalWidth, img.naturalHeight);
\t\t\toriginalRef.current = cloneCanvas(canvas);
\t\t\tworkingRef.current = canvas;
\t\t\tsetNatural({ w: img.naturalWidth, h: img.naturalHeight });
\t\t\tsetExpandOrigin({ w: img.naturalWidth, h: img.naturalHeight });
\t\t\tsetExpandSettled(false);
\t\t\tsetPreviewUrl((prev) => {
\t\t\t\trevokeIfBlob(prev);
\t\t\t\treturn preview;
\t\t\t});
\t\t\tsetFrameUrl(null);
\t\t\tsetReady(true);
\t\t};

\t\tconst load = async () => {
\t\t\ttry {
\t\t\t\tconst response = await fetch(imageUrl, { mode: 'cors', credentials: 'omit' });
\t\t\t\tif (!response.ok) throw new Error(`HTTP ${response.status}`);
\t\t\t\tconst blob = await response.blob();
\t\t\t\tif (cancelled) return;
\t\t\t\tobjectUrl = URL.createObjectURL(blob);
\t\t\t\tconst img = new Image();
\t\t\t\tawait new Promise<void>((resolve, reject) => {
\t\t\t\t\timg.onload = () => resolve();
\t\t\t\t\timg.onerror = () => reject(new Error('decode failed'));
\t\t\t\t\timg.src = objectUrl!;
\t\t\t\t});
\t\t\t\tif (cancelled) return;
\t\t\t\tpaintFromImage(img, objectUrl);
\t\t\t\tobjectUrl = null;
\t\t\t} catch {
\t\t\t\tconst img = new Image();
\t\t\t\timg.crossOrigin = 'anonymous';
\t\t\t\timg.onload = () => {
\t\t\t\t\tif (cancelled) return;
\t\t\t\t\tpaintFromImage(img, imageUrl);
\t\t\t\t};
\t\t\t\timg.onerror = () => {
\t\t\t\t\tif (cancelled) return;
\t\t\t\t\tsetStatus('Failed to load image for editing.');
\t\t\t\t\tsetReady(true);
\t\t\t\t};
\t\t\t\timg.src = imageUrl;
\t\t\t}
\t\t};

\t\tvoid load();
\t\treturn () => {
\t\t\tcancelled = true;
\t\t\tif (objectUrl) URL.revokeObjectURL(objectUrl);
\t\t};
\t}, [imageUrl, revokeIfBlob]);''',
)

replace_once(
	'rebuild effect',
	'''\tuseEffect(() => {
\t\tif (!ready) return;
\t\tconst timer = window.setTimeout(() => rebuildFramePreview(), 40);
\t\treturn () => window.clearTimeout(timer);
\t}, [ready, rebuildFramePreview, previewUrl]);''',
	'''\tuseEffect(() => {
\t\tif (!ready) return;
\t\tif (tool === 'expand' && !expandSettled) return;
\t\tconst timer = window.setTimeout(() => rebuildFramePreview(), 40);
\t\treturn () => window.clearTimeout(timer);
\t}, [ready, rebuildFramePreview, previewUrl, tool, expandSettled]);''',
)

# 4) Replace applyExpandChanges entirely
start = text.find('\tconst applyExpandChanges = useCallback(async () => {')
end = text.find('\tconst updateAdjust =', start)
if start < 0 or end < 0:
	raise SystemExit('applyExpandChanges bounds not found')

new_apply = '''\tconst applyExpandChanges = useCallback(async () => {
\t\tconst working = workingRef.current;
\t\tif (!working) {
\t\t\tsetStatus('Image not ready yet.');
\t\t\treturn;
\t\t}

\t\tconst originW = working.width;
\t\tconst originH = working.height;
\t\tsetExpandOrigin({ w: originW, h: originH });

\t\tconst scale = 1 + expandPct / 100;
\t\tconst targetW = Math.max(1, Math.round(originW * scale));
\t\tconst targetH = Math.max(1, Math.round(originH * scale));
\t\tif (targetW === originW && targetH === originH) {
\t\t\tsetStatus('Choose an expand amount above 0% first.');
\t\t\treturn;
\t\t}

\t\tconst VISUAL_MS = 900;
\t\tconst startedAt = performance.now();
\t\tlet stopped = false;
\t\tlet displayPct = 0;
\t\tsetBusy('Filling 0%…');
\t\tsetStatus(null);
\t\tconst tickId = window.setInterval(() => {
\t\t\tif (stopped) return;
\t\t\tconst elapsed = performance.now() - startedAt;
\t\t\tconst next = Math.min(95, (elapsed / VISUAL_MS) * 95);
\t\t\tconst rounded = Math.floor(next);
\t\t\tif (rounded <= displayPct) return;
\t\t\tdisplayPct = rounded;
\t\t\tsetBusy(`Filling ${displayPct}%…`);
\t\t}, 50);

\t\ttry {
\t\t\tconst expanded = expandWithEdgeFill(working, originW, originH, targetW, targetH);
\t\t\tif (!expanded.width || !expanded.height) {
\t\t\t\tthrow new Error('Expand produced an empty canvas');
\t\t\t}

\t\t\tconst remaining = Math.max(0, VISUAL_MS - (performance.now() - startedAt));
\t\t\tif (remaining > 0) {
\t\t\t\tawait new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
\t\t\t}

\t\t\tstopped = true;
\t\t\twindow.clearInterval(tickId);
\t\t\tsetBusy('Filling 100%…');

\t\t\t// Commit pixels immediately so Download cannot race an old canvas.
\t\t\tworkingRef.current = expanded;
\t\t\toriginalRef.current = cloneCanvas(expanded);
\t\t\tsetWorkingFromCanvas(expanded);
\t\t\tsetExpandOrigin({ w: expanded.width, h: expanded.height });
\t\t\tsetExpandSettled(true);
\t\t\tsetCrop(DEFAULT_CROP);
\t\t\tsetPendingCommit(false);
\t\t\tsetStatus(`Done — expanded +${expandPct}% to ${targetW}×${targetH}. Download uses this result.`);
\t\t} catch (error) {
\t\t\tconsole.error(error);
\t\t\tsetStatus('Expand failed. Please try again.');
\t\t} finally {
\t\t\tstopped = true;
\t\t\twindow.clearInterval(tickId);
\t\t\tsetBusy(null);
\t\t}
\t}, [expandPct, setWorkingFromCanvas]);

'''

text = text[:start] + new_apply + text[end:]
print('ok applyExpandChanges')

# 5) Replace buildExportCanvas + handleDownload
start = text.find('\tconst buildExportCanvas = useCallback(() => {')
end = text.find('\tconst stop = (event: React.SyntheticEvent) => {', start)
if start < 0 or end < 0:
	raise SystemExit('export bounds not found')

new_export = '''\tconst resolveExportSource = useCallback(() => {
\t\tconst working = workingRef.current;
\t\tif (!working) return null;

\t\t// If Expand preview is pending, bake fill into a temp canvas for export.
\t\tif (tool === 'expand' && !expandSettled && expandPct > 0) {
\t\t\tconst targetW = Math.max(1, Math.round(working.width * (1 + expandPct / 100)));
\t\t\tconst targetH = Math.max(1, Math.round(working.height * (1 + expandPct / 100)));
\t\t\tif (targetW !== working.width || targetH !== working.height) {
\t\t\t\treturn expandWithEdgeFill(
\t\t\t\t\tworking,
\t\t\t\t\tworking.width,
\t\t\t\t\tworking.height,
\t\t\t\t\ttargetW,
\t\t\t\t\ttargetH,
\t\t\t\t);
\t\t\t}
\t\t}
\t\treturn working;
\t}, [expandPct, expandSettled, tool]);

\tconst buildExportCanvas = useCallback(() => {
\t\tconst source = resolveExportSource();
\t\tif (!source) return null;

\t\tconst liveTransform = {
\t\t\trotation,
\t\t\tfineRotation,
\t\t\tflipX,
\t\t\tflipY,
\t\t\tcrop,
\t\t};
\t\tconst hasLive =
\t\t\thasAdjustChanges(adjust) || hasTransformChanges(liveTransform);

\t\t// Prefer the real edited pixel buffer (expand / remove-bg / applied tools).
\t\t// Only squeeze into the Size preset when the user still has live transform/adjust,
\t\t// or when source is not larger than the preset.
\t\tconst preferNative =
\t\t\t!hasLive &&
\t\t\t(source.width > canvasSize.width || source.height > canvasSize.height || expandSettled);

\t\tconst targetW = preferNative ? source.width : canvasSize.width;
\t\tconst targetH = preferNative ? source.height : canvasSize.height;

\t\tconst frame = document.createElement('canvas');
\t\tframe.width = Math.max(1, targetW);
\t\tframe.height = Math.max(1, targetH);
\t\tconst frameCtx = frame.getContext('2d');
\t\tif (!frameCtx) return null;

\t\tconst fit = containSize(source.width, source.height, frame.width, frame.height);
\t\tframeCtx.save();
\t\tframeCtx.translate(frame.width / 2, frame.height / 2);
\t\tframeCtx.rotate(((rotation + fineRotation) * Math.PI) / 180);
\t\tframeCtx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
\t\tframeCtx.drawImage(source, -fit.w / 2, -fit.h / 2, fit.w, fit.h);
\t\tframeCtx.restore();

\t\tif (hasAdjustChanges(adjust)) {
\t\t\tconst imageData = frameCtx.getImageData(0, 0, frame.width, frame.height);
\t\t\tframeCtx.putImageData(applyAdjustToImageData(imageData, adjust), 0, 0);
\t\t}

\t\tconst needsCrop = crop.x > 0.001 || crop.y > 0.001 || crop.w < 0.999 || crop.h < 0.999;
\t\tif (needsCrop) {
\t\t\tconst sx = Math.round(crop.x * frame.width);
\t\t\tconst sy = Math.round(crop.y * frame.height);
\t\t\tconst sw = Math.max(1, Math.round(crop.w * frame.width));
\t\t\tconst sh = Math.max(1, Math.round(crop.h * frame.height));
\t\t\tconst out = document.createElement('canvas');
\t\t\tout.width = sw;
\t\t\tout.height = sh;
\t\t\tconst outCtx = out.getContext('2d');
\t\t\tif (!outCtx) return frame;
\t\t\toutCtx.drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);
\t\t\treturn out;
\t\t}

\t\treturn frame;
\t}, [
\t\tadjust,
\t\tcanvasSize.height,
\t\tcanvasSize.width,
\t\tcrop,
\t\texpandSettled,
\t\tfineRotation,
\t\tflipX,
\t\tflipY,
\t\tresolveExportSource,
\t\trotation,
\t]);

\tconst handleDownload = useCallback(() => {
\t\tif (!allSizesFree && !isFreeDownloadSize(sizeId)) {
\t\t\tif (!loggedIn) {
\t\t\t\tsetSizeGateMessage('Sign in and upgrade to Pro for 2K / 4K / 8K.');
\t\t\t\treturn;
\t\t\t}
\t\t\tif (!isPro) {
\t\t\t\tsetSizeGateMessage('Pro required for 2K / 4K / 8K. Free sizes: 500 and 1K.');
\t\t\t\treturn;
\t\t\t}
\t\t}
\t\tconst canvas = buildExportCanvas();
\t\tif (!canvas) {
\t\t\tsetStatus('Nothing to download yet.');
\t\t\treturn;
\t\t}
\t\tcanvas.toBlob((blob) => {
\t\t\tif (!blob) {
\t\t\t\tsetStatus('Download failed (canvas blocked). Apply changes, then try again.');
\t\t\t\treturn;
\t\t\t}
\t\t\tconst url = URL.createObjectURL(blob);
\t\t\tconst link = document.createElement('a');
\t\t\tlink.href = url;
\t\t\tlink.download = `${title.replace(/\\s+/g, '-').toLowerCase()}-edited-${canvas.width}x${canvas.height}.png`;
\t\t\tlink.click();
\t\t\tURL.revokeObjectURL(url);
\t\t\tsetStatus(`Downloaded ${canvas.width}×${canvas.height}.`);
\t\t}, 'image/png');
\t}, [allSizesFree, buildExportCanvas, isPro, loggedIn, sizeId, title]);

'''

text = text[:start] + new_export + text[end:]
print('ok export/download')

# 6) Enable Apply even when settled; show export size on download button
text = text.replace(
	'''\t\t\t\t\t\t\t\t\tdisabled={!ready || Boolean(busy) || expandSettled}
\t\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\t\tApply changes · +{expandPct}%''',
	'''\t\t\t\t\t\t\t\t\tdisabled={!ready || Boolean(busy)}
\t\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\t\tApply changes · +{expandPct}%''',
)
print('ok apply button')

# Download label: show working/export-aware size
old_dl_label = '''\t\t\t\t\t\t\t\tDownload edited ·{' '}
\t\t\t\t\t\t\t\t{tool === 'transform'
\t\t\t\t\t\t\t\t\t? aspectPreset.label
\t\t\t\t\t\t\t\t\t: `${canvasSize.width}×${canvasSize.height}`}'''

new_dl_label = '''\t\t\t\t\t\t\t\tDownload edited ·{' '}
\t\t\t\t\t\t\t\t{tool === 'transform'
\t\t\t\t\t\t\t\t\t? aspectPreset.label
\t\t\t\t\t\t\t\t\t: tool === 'expand' && !expandSettled && expandTarget
\t\t\t\t\t\t\t\t\t\t? `${expandTarget.width}×${expandTarget.height}`
\t\t\t\t\t\t\t\t\t\t: expandSettled || natural.w > canvasSize.width
\t\t\t\t\t\t\t\t\t\t\t? `${natural.w}×${natural.h}`
\t\t\t\t\t\t\t\t\t\t\t: `${canvasSize.width}×${canvasSize.height}`}'''

if old_dl_label not in text:
	raise SystemExit('download label not found')
text = text.replace(old_dl_label, new_dl_label, 1)
print('ok download label')

path.write_text(text, encoding='utf-8')
print('DONE', path)
