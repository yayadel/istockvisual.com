(function () {
	if (window.__istockCatalogInfinite) return;
	window.__istockCatalogInfinite = true;

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function cardHtml(item) {
		var img = item.preview
			? '<img src="' +
				escapeHtml(item.preview) +
				'" alt="' +
				escapeHtml(item.title) +
				'" width="' +
				item.width +
				'" height="' +
				item.height +
				'" sizes="(max-width: 639px) 50vw, (max-width: 899px) 33vw, 25vw" loading="lazy" decoding="async">'
			: '<div class="asset-card__empty">No preview</div>';
		var pro = item.isPremium ? '<span class="asset-card__pro" aria-label="Pro">Pro</span>' : '';
		return (
			'<a class="asset-card asset-card--' +
			escapeHtml(item.tile) +
			'" href="' +
			escapeHtml(item.href) +
			'" data-ratio="' +
			item.ratio +
			'">' +
			img +
			pro +
			'<span class="asset-card__caption">' +
			escapeHtml(item.title) +
			'</span></a>'
		);
	}

	function queryUrl(root, page) {
		var params = new URLSearchParams();
		var q = root.getAttribute('data-q') || '';
		if (q) params.set('q', q);
		var type = root.getAttribute('data-type') || '';
		if (type && type !== 'all') params.set('category', type);
		var topic = root.getAttribute('data-topic') || '';
		if (topic) params.set('topic', topic);
		var color = root.getAttribute('data-color') || '';
		if (color) params.set('color', color);
		var orient = root.getAttribute('data-orient') || '';
		if (orient) params.set('orient', orient);
		var exclude = root.getAttribute('data-exclude') || '';
		if (exclude) params.set('exclude', exclude);
		var sort = root.getAttribute('data-sort') || '';
		if (sort && sort !== 'newest') params.set('sort', sort);
		var mode = root.getAttribute('data-mode') || '';
		if (mode) params.set('mode', mode);
		var c = root.getAttribute('data-c') || '';
		if (c) params.set('c', c);
		params.set('page', String(page));
		return '/api/catalog?' + params.toString();
	}

	function inLowerHalf() {
		var doc = document.documentElement;
		var height = Math.max(doc.scrollHeight, document.body.scrollHeight);
		return window.scrollY + window.innerHeight >= height * 0.5;
	}

	function packGrid(grid) {
		if (typeof window.istockPackAssetGrid === 'function') {
			window.istockPackAssetGrid(grid);
		}
	}

	function bind(root) {
		if (!(root instanceof HTMLElement) || root.getAttribute('data-bound')) return;
		root.setAttribute('data-bound', '1');

		var grid = root.closest('.catalog-results')?.querySelector('[data-asset-grid]');
		if (!grid) return;

		var page = Number(root.getAttribute('data-page') || '1');
		var hasMore = root.getAttribute('data-has-more') === '1';
		var loading = false;
		var status = root.querySelector('[data-catalog-status]');

		function setStatus(text, done) {
			if (!status) return;
			status.hidden = !text;
			status.textContent = text || '';
			status.classList.toggle('is-end', Boolean(done));
		}

		function finish() {
			hasMore = false;
			root.setAttribute('data-has-more', '0');
			setStatus("You've reached the end of this catalog.", true);
		}

		async function loadNext() {
			if (!hasMore || loading) return;
			loading = true;
			setStatus('Loading more…', false);
			var nextPage = page + 1;
			try {
				var res = await fetch(queryUrl(root, nextPage), { credentials: 'same-origin' });
				if (!res.ok) throw new Error('catalog');
				var data = await res.json();
				var items = Array.isArray(data.items) ? data.items : [];
				if (!items.length) {
					finish();
					return;
				}
				var wrap = document.createElement('div');
				wrap.innerHTML = items.map(cardHtml).join('');
				while (wrap.firstChild) grid.appendChild(wrap.firstChild);
				packGrid(grid);
				page = data.page || nextPage;
				root.setAttribute('data-page', String(page));
				hasMore = Boolean(data.hasMore);
				root.setAttribute('data-has-more', hasMore ? '1' : '0');
				if (!hasMore) finish();
				else setStatus('', false);
			} catch (err) {
				setStatus('Could not load more. Scroll to try again.', false);
			} finally {
				loading = false;
			}
		}

		function maybeLoad() {
			if (hasMore && inLowerHalf()) loadNext();
		}

		window.addEventListener('scroll', maybeLoad, { passive: true });
		window.addEventListener('resize', maybeLoad);
		maybeLoad();
	}

	function boot() {
		document.querySelectorAll('[data-catalog-infinite]').forEach(bind);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();
