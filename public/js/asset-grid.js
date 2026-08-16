(function () {
	if (window.__istockAssetGridPack) return;
	window.__istockAssetGridPack = true;

	var RATIO = {
		short: 9 / 16,
		landscape: 4 / 5,
		square: 1,
		portrait: 5 / 4,
		tall: 5 / 3,
	};

	function colCount(width) {
		if (width < 640) return 2;
		if (width < 900) return 3;
		return 4;
	}

	function gapFor(count) {
		return count <= 2 ? 8 : 12;
	}

	function ratioOf(card) {
		var named = card.getAttribute('data-ratio');
		if (named) {
			var n = parseFloat(named);
			if (n > 0) return n;
		}
		var match = card.className.match(/asset-card--(short|landscape|square|portrait|tall)/);
		return RATIO[match && match[1] ? match[1] : 'square'] || 1;
	}

	function pack(grid) {
		var cards = Array.prototype.slice.call(grid.querySelectorAll('.asset-card'));
		if (!cards.length) return;

		var colsN = colCount(grid.clientWidth);
		var gap = gapFor(colsN);
		var colW = (grid.clientWidth - gap * (colsN - 1)) / colsN;
		if (colW < 40) return;

		var columns = Array.from({ length: colsN }, function () {
			return [];
		});
		var heights = Array(colsN).fill(0);

		cards.forEach(function (card) {
			var ratio = ratioOf(card);
			var h = ratio * colW;
			var slot = 0;
			for (var i = 1; i < colsN; i += 1) {
				if (heights[i] < heights[slot] - 0.5) slot = i;
			}
			columns[slot].push({ card: card, ratio: ratio });
			heights[slot] += h + gap;
		});

		var target = Math.max.apply(null, heights);
		if (target < 8) return;

		grid.classList.add('is-packed');
		grid.style.height = target - gap + 'px';

		columns.forEach(function (col, i) {
			if (!col.length) return;
			var imgSum = col.reduce(function (sum, item) {
				return sum + item.ratio * colW;
			}, 0);
			var targetImg = target - gap * col.length;
			var scale = imgSum > 0 ? targetImg / imgSum : 1;
			var y = 0;
			var left = i * (colW + gap);
			col.forEach(function (item) {
				var h = item.ratio * colW * scale;
				item.card.style.position = 'absolute';
				item.card.style.left = left + 'px';
				item.card.style.top = y + 'px';
				item.card.style.width = colW + 'px';
				item.card.style.height = h + 'px';
				item.card.style.margin = '0';
				item.card.style.aspectRatio = 'auto';
				y += h + gap;
			});
		});
	}

	window.istockPackAssetGrid = pack;

	function bind(grid) {
		if (grid.getAttribute('data-grid-bound')) return;
		grid.setAttribute('data-grid-bound', '1');
		var timer = 0;
		function run() {
			pack(grid);
		}
		run();
		window.addEventListener('resize', function () {
			window.clearTimeout(timer);
			timer = window.setTimeout(run, 80);
		});
	}

	function boot() {
		document.querySelectorAll('[data-asset-grid]').forEach(bind);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();
