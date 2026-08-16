(function () {
	if (window.__istockHomeCatsMarqueeV3) return;
	window.__istockHomeCatsMarqueeV3 = true;

	function parseData(root) {
		var node = root.querySelector('script[type="application/json"]');
		if (!node) return [];
		try {
			var data = JSON.parse(node.textContent || '[]');
			return Array.isArray(data) ? data : [];
		} catch (err) {
			return [];
		}
	}

	function makeCard(item) {
		var a = document.createElement('a');
		a.className = 'home-cats__card';
		a.href = item.href;
		var img = document.createElement('img');
		img.src = item.image;
		img.alt = '';
		img.draggable = false;
		img.decoding = 'async';
		var label = document.createElement('span');
		label.className = 'home-cats__label';
		label.textContent = item.label;
		a.appendChild(img);
		a.appendChild(label);
		return a;
	}

	function setup(root) {
		if (root.getAttribute('data-cats-ready') === 'v3') return;
		root.setAttribute('data-cats-ready', 'v3');

		var data = parseData(root);
		var viewport = root.querySelector('[data-cats-scroller]');
		var track = root.querySelector('.home-cats__track');
		if (!viewport || !track || data.length === 0) return;

		var duration = parseFloat(root.getAttribute('data-cats-duration')) || 48;
		var start = 0;
		var x = 0;
		var dragging = false;
		var axis = '';
		var moved = 0;
		var pointerId = null;
		var startX = 0;
		var startY = 0;
		var lastX = 0;
		var userUntil = 0;
		var lastTs = 0;
		var IDLE_MS = 2500;

		function stride() {
			var card = track.querySelector('.home-cats__card');
			if (!card) return 0;
			var styles = window.getComputedStyle(track);
			var gap = parseFloat(styles.columnGap || styles.gap) || 12;
			return Math.round(card.getBoundingClientRect().width + gap);
		}

		function countNeeded() {
			var w = stride();
			if (w < 8) return Math.max(8, data.length);
			return Math.max(8, Math.ceil(viewport.clientWidth / w) + 4);
		}

		function paint() {
			var need = countNeeded();
			track.innerHTML = '';
			for (var i = 0; i < need; i += 1) {
				track.appendChild(makeCard(data[(start + i) % data.length]));
			}
		}

		function stepLeft() {
			var s = stride();
			if (s < 8) return;
			start = (start + 1) % data.length;
			if (track.firstElementChild) track.removeChild(track.firstElementChild);
			track.appendChild(makeCard(data[(start + track.children.length) % data.length]));
			x += s;
		}

		function stepRight() {
			var s = stride();
			if (s < 8) return;
			start = (start - 1 + data.length) % data.length;
			if (track.lastElementChild) track.removeChild(track.lastElementChild);
			track.insertBefore(makeCard(data[start]), track.firstElementChild);
			x -= s;
		}

		function normalize() {
			var s = stride();
			if (s < 8) return;
			while (x <= -s) stepLeft();
			while (x > 0) stepRight();
			track.style.transform = 'translate3d(' + x + 'px,0,0)';
		}

		function holding() {
			return dragging || Date.now() < userUntil;
		}

		function tick(ts) {
			if (!lastTs) lastTs = ts;
			var dt = Math.min(0.05, (ts - lastTs) / 1000);
			lastTs = ts;
			var s = stride();
			if (!holding() && s > 8) {
				x -= (s * data.length / duration) * dt;
				normalize();
			}
			requestAnimationFrame(tick);
		}

		function onDown(event) {
			if (event.button != null && event.button !== 0) return;
			dragging = true;
			axis = '';
			moved = 0;
			pointerId = event.pointerId;
			startX = event.clientX;
			startY = event.clientY;
			startOff = x;
			userUntil = Number.POSITIVE_INFINITY;
			root.classList.add('is-grabbing');
			try {
				viewport.setPointerCapture(event.pointerId);
			} catch (err) {}
		}

		function onMove(event) {
			if (!dragging || (pointerId != null && event.pointerId !== pointerId)) return;
			var dx = event.clientX - startX;
			var dy = event.clientY - startY;
			moved = Math.max(moved, Math.abs(dx), Math.abs(dy));
			if (!axis && moved > 8) axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
			if (axis !== 'x') return;
			if (event.cancelable) event.preventDefault();
			root.classList.add('is-dragging');
			x = startOff + dx;
			normalize();
		}

		function onUp(event) {
			if (!dragging) return;
			if (pointerId != null && event && event.pointerId !== pointerId) return;
			dragging = false;
			pointerId = null;
			root.classList.remove('is-grabbing');
			window.setTimeout(function () {
				root.classList.remove('is-dragging');
			}, 80);
			userUntil = Date.now() + IDLE_MS;
			normalize();
		}

		viewport.addEventListener('pointerdown', onDown);
		viewport.addEventListener('pointermove', onMove, { passive: false });
		viewport.addEventListener('pointerup', onUp);
		viewport.addEventListener('pointercancel', onUp);
		viewport.addEventListener(
			'touchmove',
			function (event) {
				if (axis === 'x' && event.cancelable) event.preventDefault();
			},
			{ passive: false }
		);
		viewport.addEventListener(
			'click',
			function (event) {
				if (moved < 8) return;
				event.preventDefault();
				event.stopPropagation();
			},
			true
		);
		viewport.addEventListener('dragstart', function (event) {
			event.preventDefault();
		});
		window.addEventListener('resize', function () {
			paint();
			x = 0;
			normalize();
		});

		paint();
		normalize();
		requestAnimationFrame(tick);
	}

	function boot() {
		document.querySelectorAll('.home-cats').forEach(setup);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();
