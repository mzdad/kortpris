"use strict";

// Finds where the card is in a photo, so the reader (reader.js) can read just the card and not
// the table, cloth or toploader around it, and knows where the small print sits on it.
// Two ways, tried in this order:
// 1. By its yellow border: most cards from 1999 to 2022 have one.
// 2. By its shape: four long straight edges making a rectangle the shape of a card. That also
//    finds cards with a silver border (2023 on, and foil cards), which look just like a grey or
//    white table, so their colour alone can't tell them apart.
// Both return a box { x0, x1, y0, y1 } in the photo, or null, with foundBy saying which way.

// A card is 63 x 88 mm. A found box further than this from that shape is not a card.
const CARD_SHAPE = 63 / 88;
const CARD_SHAPE_TOLERANCE = 0.08;

// ---------- By the yellow border ----------

// The photo is shrunk to this width to count yellow pixels...
const CARD_FINDER_WIDTH = 300;
// ...and a row or column counts as border when at least this share of it is yellow.
// Tuned on real photos of cards in toploaders on a patterned cloth.
const BORDER_YELLOW_SHARE = 0.4;

function findYellowCard(photo) {
	// The card's left and right edges are yellow almost all the way down, and its top and
	// bottom edges almost all the way across - which no picture on a card is. So the card is
	// the box between the outermost rows and columns that are mostly yellow.
	const width = CARD_FINDER_WIDTH;
	const height = Math.round(photo.height * width / photo.width);
	const small = document.createElement("canvas");
	small.width = width;
	small.height = height;
	const ctx = small.getContext("2d", { willReadFrequently: true });
	ctx.drawImage(photo, 0, 0, width, height);
	const pixels = ctx.getImageData(0, 0, width, height).data;
	const yellowInColumn = new Array(width).fill(0);
	const yellowInRow = new Array(height).fill(0);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			if (isYellow(pixels[i], pixels[i + 1], pixels[i + 2])) {
				yellowInColumn[x]++;
				yellowInRow[y]++;
			}
		}
	}
	const columns = borderLines(yellowInColumn, height * BORDER_YELLOW_SHARE);
	const rows = borderLines(yellowInRow, width * BORDER_YELLOW_SHARE);
	if (columns.length < 2 || rows.length < 2) return null;
	const scale = photo.width / width;
	const box = {
		x0: columns[0] * scale,
		x1: (columns[columns.length - 1] + 1) * scale,
		y0: rows[0] * scale,
		y1: (rows[rows.length - 1] + 1) * scale,
		foundBy: "yellow border",
	};
	// Not the shape of a card: something else yellow, or a card without a yellow border.
	const shape = (box.x1 - box.x0) / (box.y1 - box.y0);
	return Math.abs(shape - CARD_SHAPE) <= CARD_SHAPE_TOLERANCE ? box : null;
}

function borderLines(yellowCounts, minimum) {
	// The rows (or columns) that are mostly yellow. A single one on its own is ignored:
	// a real border is at least two pixels thick at this size.
	const lines = [];
	for (let i = 0; i < yellowCounts.length; i++) {
		const neighbourToo = yellowCounts[i - 1] >= minimum || yellowCounts[i + 1] >= minimum;
		if (yellowCounts[i] >= minimum && neighbourToo) lines.push(i);
	}
	return lines;
}

function isYellow(red, green, blue) {
	const brightest = Math.max(red, green, blue);
	const dimmest = Math.min(red, green, blue);
	if (brightest < 120 || brightest - dimmest < 70) return false;   // too dark, or too grey
	// Yellow: a colour between orange and lime on the colour wheel (hue 28 to 68 degrees).
	// Warm indoor light makes a yellow border look orange to the camera, down to about 31.
	const hue = hueOf(red, green, blue, brightest, dimmest);
	return hue >= 28 && hue <= 68;
}

function hueOf(red, green, blue, brightest, dimmest) {
	// Where a colour sits on the colour wheel, 0-360 degrees: red 0, yellow 60, green 120...
	const range = brightest - dimmest;
	let sixths;
	if (brightest === red) sixths = ((green - blue) / range) % 6;
	else if (brightest === green) sixths = (blue - red) / range + 2;
	else sixths = (red - green) / range + 4;
	const hue = sixths * 60;
	return hue < 0 ? hue + 360 : hue;
}

// ---------- By its shape ----------

// The photo is shrunk to this width to look for edges.
const SHAPE_FINDER_WIDTH = 400;
// Neighbouring pixels this different (red, green and blue differences added up) make an edge.
const EDGE_STRENGTH = 70;
// A card's edges may lean a little, in a crooked photo: tried from -6 to 6 degrees in quarter steps.
const MAX_EDGE_LEAN = 6;
const EDGE_LEAN_STEP = 0.25;
// This many of the longest straight lines in each direction are tried as the card's sides.
const EDGE_LINES_TRIED = 14;
// Lines this close to the photo's own edge (share of its size) are the photo's edge, not the card's.
const PHOTO_EDGE_MARGIN = 0.02;
// A card fills at least this share of the photo's height.
const MIN_CARD_HEIGHT_SHARE = 0.3;
// Each side of the card must have an edge along at least this share of its length.
const MIN_SIDE_SUPPORT = 0.7;
// A card's border ends this far in from its edge (share of the card's width), which shows as a
// second, smaller rectangle - counted when its sides are edges along this share of their length.
const BORDER_WIDTH_MIN = 0.03;
const BORDER_WIDTH_MAX = 0.075;
const BORDER_LINE_SUPPORT = 0.5;
// The colour change across each side is measured between bands this wide (share of the card's width).
const CONTRAST_BAND = 0.03;
// How a candidate's score adds up (see shapeScore), and the least score that is trusted. Tuned on
// real photos of cards in toploaders and fake photos of silver-bordered cards on five table colours:
// right boxes scored 1.37 and up, wrong ones at most 1.27.
const CONTRAST_SCALE = 150;
const BORDER_BONUS = 0.5;
const MIN_SHAPE_SCORE = 1.3;

function findCardByShape(photo) {
	const map = edgeMap(photo);
	const uprights = straightLines(map, true);
	const crossings = straightLines(map, false);
	let best = null;
	for (const left of uprights) {
		for (const right of uprights) {
			if (right.offset <= left.offset) continue;
			for (const top of crossings) {
				for (const bottom of crossings) {
					if (bottom.offset <= top.offset) continue;
					const box = { x0: left.offset, x1: right.offset, y0: top.offset, y1: bottom.offset };
					const width = box.x1 - box.x0;
					const height = box.y1 - box.y0;
					if (height < map.height * MIN_CARD_HEIGHT_SHARE) continue;
					if (Math.abs(width / height - CARD_SHAPE) > CARD_SHAPE_TOLERANCE) continue;
					// How much of each side really is an edge.
					const sides = [
						lineSupport(map, left, box.y0, box.y1),
						lineSupport(map, right, box.y0, box.y1),
						lineSupport(map, top, box.x0, box.x1),
						lineSupport(map, bottom, box.x0, box.x1),
					];
					const weakestSide = Math.min(...sides);
					if (weakestSide < MIN_SIDE_SUPPORT) continue;
					const score = shapeScore(map, box, weakestSide, uprights, crossings);
					if (!best || score > best.score) best = { box: box, score: score };
				}
			}
		}
	}
	if (!best || best.score < MIN_SHAPE_SCORE) return null;
	const scale = photo.width / map.width;
	return {
		x0: best.box.x0 * scale,
		x1: best.box.x1 * scale,
		y0: best.box.y0 * scale,
		y1: best.box.y1 * scale,
		foundBy: "shape",
	};
}

function shapeScore(map, box, weakestSide, uprights, crossings) {
	// Many rectangles in a photo have card-like edges: the card, but also the inside of its
	// border, and a toploader around it. The card is the one that:
	// - has clear edges all round (weakestSide, from 0.7 to 1),
	// - changes colour sharply across every side, from background to border (a toploader's edge
	//   has the same cloth or table on both sides),
	// - has the inner edge of its border just inside it, while the inside of the border has
	//   that same edge just outside it instead.
	let score = weakestSide + weakestContrast(map, box) / CONTRAST_SCALE;
	if (borderEdgeFound(map, box, 1, uprights, crossings)) score += BORDER_BONUS;
	if (borderEdgeFound(map, box, -1, uprights, crossings)) score -= BORDER_BONUS;
	return score;
}

function edgeMap(photo) {
	// Marks every pixel where the colour changes sharply: "upright" where it changes from left
	// to right (as on the card's left and right sides), "crossing" where it changes from top to
	// bottom (as on its top and bottom).
	const width = SHAPE_FINDER_WIDTH;
	const height = Math.round(photo.height * width / photo.width);
	const small = document.createElement("canvas");
	small.width = width;
	small.height = height;
	const ctx = small.getContext("2d", { willReadFrequently: true });
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(photo, 0, 0, width, height);
	const pixels = ctx.getImageData(0, 0, width, height).data;
	const upright = new Uint8Array(width * height);
	const crossing = new Uint8Array(width * height);
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			let acrossChange = 0;
			let downChange = 0;
			for (let colour = 0; colour < 3; colour++) {
				acrossChange += Math.abs(pixels[(y * width + x + 1) * 4 + colour] - pixels[(y * width + x - 1) * 4 + colour]);
				downChange += Math.abs(pixels[((y + 1) * width + x) * 4 + colour] - pixels[((y - 1) * width + x) * 4 + colour]);
			}
			if (acrossChange >= EDGE_STRENGTH && acrossChange >= downChange) upright[y * width + x] = 1;
			if (downChange >= EDGE_STRENGTH && downChange > acrossChange) crossing[y * width + x] = 1;
		}
	}
	return { width, height, pixels, upright, crossing };
}

// A straight line is { isUpright, lean, offset }: an upright line passes x = offset at the photo's
// middle height and leans lean degrees; a crossing line likewise passes y = offset at the middle width.
function straightLines(map, isUpright) {
	// Every edge pixel votes for each line it could lie on, for every lean from -6 to 6 degrees.
	// Long straight edges collect far more votes than the short edges in patterns and pictures.
	// (This is known as a Hough transform.)
	const flags = isUpright ? map.upright : map.crossing;
	const across = isUpright ? map.width : map.height;   // how many offsets a line can have
	const leans = [];
	for (let lean = -MAX_EDGE_LEAN; lean <= MAX_EDGE_LEAN + 1e-9; lean += EDGE_LEAN_STEP) leans.push(lean);
	const slopes = leans.map((lean) => Math.tan(lean * Math.PI / 180));
	const votes = leans.map(() => new Float32Array(across));
	for (let y = 0; y < map.height; y++) {
		for (let x = 0; x < map.width; x++) {
			if (!flags[y * map.width + x]) continue;
			const position = isUpright ? x : y;
			const along = isUpright ? y - map.height / 2 : x - map.width / 2;
			for (let k = 0; k < leans.length; k++) {
				const offset = Math.round(position - along * slopes[k]);
				if (offset >= 0 && offset < across) votes[k][offset]++;
			}
		}
	}
	const all = [];
	for (let k = 0; k < leans.length; k++) {
		for (let offset = 0; offset < across; offset++) {
			all.push({ isUpright: isUpright, lean: leans[k], slope: slopes[k], offset: offset, votes: votes[k][offset] });
		}
	}
	all.sort((a, b) => b.votes - a.votes);
	// The most voted lines, each at least a few pixels from the others (one edge gets votes at
	// several leans and offsets), and none along the photo's own edge.
	const chosen = [];
	for (const line of all) {
		if (chosen.length === EDGE_LINES_TRIED) break;
		if (line.offset < across * PHOTO_EDGE_MARGIN || line.offset > across * (1 - PHOTO_EDGE_MARGIN)) continue;
		if (chosen.some((other) => Math.abs(other.offset - line.offset) <= 4)) continue;
		chosen.push(line);
	}
	return chosen;
}

function lineSupport(map, line, from, to) {
	// The share of the line, between from and to (along it), that has an edge pixel within one
	// pixel of it.
	const flags = line.isUpright ? map.upright : map.crossing;
	const length = line.isUpright ? map.height : map.width;
	const middle = length / 2;
	let onEdge = 0;
	let total = 0;
	for (let along = Math.max(1, Math.round(from)); along <= Math.min(length - 2, Math.round(to)); along++) {
		const position = Math.round(line.offset + (along - middle) * line.slope);
		total++;
		for (let nudge = -1; nudge <= 1; nudge++) {
			const at = position + nudge;
			const inside = line.isUpright ? at >= 0 && at < map.width : at >= 0 && at < map.height;
			const index = line.isUpright ? along * map.width + at : at * map.width + along;
			if (inside && flags[index]) {
				onEdge++;
				break;
			}
		}
	}
	return total > 0 ? onEdge / total : 0;
}

function weakestContrast(map, box) {
	// For each side, how different the average colour just inside it is from just outside it.
	// Returns the smallest of the four. Sides at the photo's edge, with nothing outside, don't count.
	const band = Math.max(3, Math.round((box.x1 - box.x0) * CONTRAST_BAND));
	const gap = 1;   // skip the edge pixels themselves
	const pairs = [
		[{ x0: box.x0 + gap, x1: box.x0 + gap + band, y0: box.y0 + band, y1: box.y1 - band },
			{ x0: box.x0 - gap - band, x1: box.x0 - gap, y0: box.y0 + band, y1: box.y1 - band }],
		[{ x0: box.x1 - gap - band, x1: box.x1 - gap, y0: box.y0 + band, y1: box.y1 - band },
			{ x0: box.x1 + gap, x1: box.x1 + gap + band, y0: box.y0 + band, y1: box.y1 - band }],
		[{ x0: box.x0 + band, x1: box.x1 - band, y0: box.y0 + gap, y1: box.y0 + gap + band },
			{ x0: box.x0 + band, x1: box.x1 - band, y0: box.y0 - gap - band, y1: box.y0 - gap }],
		[{ x0: box.x0 + band, x1: box.x1 - band, y0: box.y1 - gap - band, y1: box.y1 - gap },
			{ x0: box.x0 + band, x1: box.x1 - band, y0: box.y1 + gap, y1: box.y1 + gap + band }],
	];
	let weakest = Infinity;
	for (const [inside, outside] of pairs) {
		const inColour = averageColour(map, inside);
		const outColour = averageColour(map, outside);
		if (!inColour || !outColour) continue;
		const difference = Math.hypot(inColour[0] - outColour[0], inColour[1] - outColour[1], inColour[2] - outColour[2]);
		weakest = Math.min(weakest, difference);
	}
	return Number.isFinite(weakest) ? weakest : 0;
}

function averageColour(map, area) {
	// [red, green, blue] averaged over the part of the area inside the photo, or null if none is.
	const sums = [0, 0, 0];
	let count = 0;
	for (let y = Math.max(0, Math.round(area.y0)); y < Math.min(map.height, Math.round(area.y1)); y++) {
		for (let x = Math.max(0, Math.round(area.x0)); x < Math.min(map.width, Math.round(area.x1)); x++) {
			const i = (y * map.width + x) * 4;
			sums[0] += map.pixels[i];
			sums[1] += map.pixels[i + 1];
			sums[2] += map.pixels[i + 2];
			count++;
		}
	}
	return count > 0 ? sums.map((sum) => sum / count) : null;
}

function borderEdgeFound(map, box, direction, uprights, crossings) {
	// True when all four sides have a parallel edge one border's width away: inside the box
	// (direction 1) or outside it (direction -1).
	const width = box.x1 - box.x0;
	const sides = [
		{ lines: uprights, at: box.x0, inward: 1, from: box.y0, to: box.y1 },
		{ lines: uprights, at: box.x1, inward: -1, from: box.y0, to: box.y1 },
		{ lines: crossings, at: box.y0, inward: 1, from: box.x0, to: box.x1 },
		{ lines: crossings, at: box.y1, inward: -1, from: box.x0, to: box.x1 },
	];
	return sides.every((side) => side.lines.some((line) => {
		const distance = (line.offset - side.at) * side.inward * direction;
		if (distance < width * BORDER_WIDTH_MIN || distance > width * BORDER_WIDTH_MAX) return false;
		return lineSupport(map, line, side.from, side.to) >= BORDER_LINE_SUPPORT;
	}));
}
