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
// A reach along a border (see yellowReach) is only trusted from at least this many yellow pixels.
const MIN_REACH_PIXELS = 10;

// A photo is seldom quite straight, so the border's rows and columns may lean: the yellow is counted
// along lines leaning up to this many degrees either way, in these steps, and the lean where it
// lines up best is used. (Straight columns missed the borders of 5 of 41 made-up photos tilted 2 to
// 4 degrees in version 1.39.2.)
const YELLOW_MAX_LEAN = 6;
const YELLOW_LEAN_STEP = 0.5;
// Two border lines are the card's two sides when at least this far apart (share of the photo's size).
const MIN_BORDER_GAP = 0.3;

function findYellowCard(photo) {
	// The card's left and right edges are yellow almost all the way down, and its top and
	// bottom edges almost all the way across - which no picture on a card is. So the card is
	// the box between the outermost rows and columns that are mostly yellow.
	const width = CARD_FINDER_WIDTH;
	const height = Math.round(photo.height * width / photo.width);
	const yellow = yellowPixels(photo, width, height);
	if (yellow.x.length === 0) return null;
	const straight = straightestLean(yellow, width, height);
	const columns = borderLines(straight.columns, height * BORDER_YELLOW_SHARE);
	const rows = borderLines(straight.rows, width * BORDER_YELLOW_SHARE);
	// Both sides found on an axis give the card's width (or height). Glare or a shadow can hide
	// one side's border, or both: then how far the yellow reaches along the top or bottom border
	// shows how wide the card is, and along a side border how tall - together with any border line
	// that was found. (Without this, one side border and the bottom border made a box the size of
	// their corner, in 4 of 41 made-up photos in version 1.39.2.)
	const across = bordersApart(columns, width) || withLines(yellowReach(yellow, straight, rows, true), columns);
	const down = bordersApart(rows, height) || withLines(yellowReach(yellow, straight, columns, false), rows);
	if (!across || !down) return null;
	if (down.to - down.from < height * MIN_CARD_HEIGHT_SHARE) return null;
	const scale = photo.width / width;
	const box = {
		x0: across.from * scale,
		x1: across.to * scale,
		y0: down.from * scale,
		y1: down.to * scale,
		foundBy: "yellow border",
	};
	// Not the shape of a card: something else yellow, or a card without a yellow border.
	const shape = (box.x1 - box.x0) / (box.y1 - box.y0);
	return Math.abs(shape - CARD_SHAPE) <= CARD_SHAPE_TOLERANCE ? box : null;
}

function yellowPixels(photo, width, height) {
	// Where the yellow pixels are in a copy of the photo this size: { x: [...], y: [...] }.
	const small = document.createElement("canvas");
	small.width = width;
	small.height = height;
	const ctx = small.getContext("2d", { willReadFrequently: true });
	ctx.drawImage(photo, 0, 0, width, height);
	const pixels = ctx.getImageData(0, 0, width, height).data;
	const yellow = { x: [], y: [] };
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			if (isYellow(pixels[i], pixels[i + 1], pixels[i + 2])) {
				yellow.x.push(x);
				yellow.y.push(y);
			}
		}
	}
	return yellow;
}

function straightestLean(yellow, width, height) {
	// The yellow counted along leaning columns and rows, at each lean in turn. At the card's own
	// lean its border lines up in the fewest, fullest columns and rows; that shows as the largest
	// sum of the counts squared. Returns { slope, columns, rows } for that lean.
	let best = null;
	for (let lean = -YELLOW_MAX_LEAN; lean <= YELLOW_MAX_LEAN; lean += YELLOW_LEAN_STEP) {
		const slope = Math.tan(lean * Math.PI / 180);
		const columns = new Array(width).fill(0);
		const rows = new Array(height).fill(0);
		for (let i = 0; i < yellow.x.length; i++) {
			const place = leanedPlace(yellow.x[i], yellow.y[i], slope, width, height);
			if (place.column >= 0 && place.column < width) columns[place.column]++;
			if (place.row >= 0 && place.row < height) rows[place.row]++;
		}
		let lineUp = 0;
		for (const count of columns) lineUp += count * count;
		for (const count of rows) lineUp += count * count;
		if (!best || lineUp > best.lineUp) best = { lineUp: lineUp, slope: slope, columns: columns, rows: rows };
	}
	return best;
}

function leanedPlace(x, y, slope, width, height) {
	// Which leaning column and row a pixel lies on: the column is where its line crosses the
	// photo's middle height, the row where its line crosses the middle width. A rectangle's sides
	// lean the same way, so the rows lean at a right angle to the columns.
	return {
		column: Math.round(x - (y - height / 2) * slope),
		row: Math.round(y + (x - width / 2) * slope),
	};
}

function bordersApart(lines, size) {
	// The outermost two border lines, as { from, to }, when they are far enough apart to be the
	// card's two sides; otherwise null (one side, or two lines of the same border).
	if (lines.length < 2) return null;
	const from = lines[0];
	const to = lines[lines.length - 1] + 1;
	return to - from >= size * MIN_BORDER_GAP ? { from: from, to: to } : null;
}

function yellowReach(yellow, straight, lines, alongRows) {
	// How far the yellow reaches along some border lines: along rows (the top or bottom border)
	// from left to right, along columns (a side border) from top to bottom. The outermost bits
	// are left out, as a stray yellow pixel can lie in line with the border. Null when too few.
	const onLines = new Set(lines);
	const width = straight.columns.length;
	const height = straight.rows.length;
	const reach = [];
	for (let i = 0; i < yellow.x.length; i++) {
		const place = leanedPlace(yellow.x[i], yellow.y[i], straight.slope, width, height);
		if (alongRows && onLines.has(place.row)) reach.push(place.column);
		if (!alongRows && onLines.has(place.column)) reach.push(place.row);
	}
	if (reach.length < MIN_REACH_PIXELS) return null;
	reach.sort((a, b) => a - b);
	return { from: reach[Math.floor(reach.length * 0.02)], to: reach[Math.floor(reach.length * 0.98)] + 1 };
}

function withLines(reach, lines) {
	// A reach widened to take in the border lines that were found across it.
	if (!reach || lines.length === 0) return reach;
	return { from: Math.min(reach.from, lines[0]), to: Math.max(reach.to, lines[lines.length - 1] + 1) };
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
// A box scoring less, but at least this, may still be the card: a dark card in a toploader on a dark
// cloth scored 1.26 (hardly any colour change across its sides), made-up full-art cards on a grey
// table 1.01 and 1.07. But so do wrong boxes - a wallpaper without any card scored 1.33 - so such a
// box is marked doubtful, and reader.js only takes it once the number reads sure where the box says
// it is printed (see readCardPhoto).
const MIN_DOUBTFUL_SHAPE_SCORE = 1.0;

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
	if (!best || best.score < MIN_DOUBTFUL_SHAPE_SCORE) return null;
	const scale = photo.width / map.width;
	return {
		x0: best.box.x0 * scale,
		x1: best.box.x1 * scale,
		y0: best.box.y0 * scale,
		y1: best.box.y1 * scale,
		foundBy: "shape",
		doubtful: best.score < MIN_SHAPE_SCORE,
	};
}

// ---------- A scan ----------

// A scan, or a photo cut to the card, has the card's own shape: then the whole photo is the card.
// Its edges are the photo's, which findCardByShape leaves out (PHOTO_EDGE_MARGIN). A phone's photo
// is 0.75 as wide as it is tall, a card 0.716, so this is kept tight.
const WHOLE_PHOTO_SHAPE_TOLERANCE = 0.015;

function wholePhotoCard(photo) {
	if (Math.abs(photo.width / photo.height - CARD_SHAPE) > WHOLE_PHOTO_SHAPE_TOLERANCE) return null;
	return { x0: 0, x1: photo.width, y0: 0, y1: photo.height, foundBy: "whole photo" };
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
// Lines closer to the photo's own edge than margin (share of its size) are left out.
function straightLines(map, isUpright, margin = PHOTO_EDGE_MARGIN) {
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
		if (line.offset < across * margin || line.offset > across * (1 - margin)) continue;
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

function borderEdgeFound(map, box, direction, uprights, crossings, atPhotoEdge = [false, false, false, false]) {
	// True when all four sides have a parallel edge one border's width away: inside the box
	// (direction 1) or outside it (direction -1). Sides at the photo's edge (atPhotoEdge: left, right,
	// top, bottom - see findCardAtPhotoEdge) have none to see, and are left out.
	const width = box.x1 - box.x0;
	const sides = [
		{ lines: uprights, at: box.x0, inward: 1, from: box.y0, to: box.y1 },
		{ lines: uprights, at: box.x1, inward: -1, from: box.y0, to: box.y1 },
		{ lines: crossings, at: box.y0, inward: 1, from: box.x0, to: box.x1 },
		{ lines: crossings, at: box.y1, inward: -1, from: box.x0, to: box.x1 },
	];
	return sides.every((side, index) => atPhotoEdge[index] || side.lines.some((line) => {
		const distance = (line.offset - side.at) * side.inward * direction;
		if (distance < width * BORDER_WIDTH_MIN || distance > width * BORDER_WIDTH_MAX) return false;
		return lineSupport(map, line, side.from, side.to) >= BORDER_LINE_SUPPORT;
	}));
}

// ---------- A card reaching the photo's edge ----------

// A card photographed close up can reach the photo's edge, or run past it (the Dratini in IMG_2022:
// its top at the photo's top, its left side a few pixels from the photo's left). Then one or two of
// its sides are the photo's own edge, which findCardByShape leaves out (PHOTO_EDGE_MARGIN): this
// tries those boxes too, when nothing else was found. Lines closer than this to the photo's edge
// (share of its size) are still left out: a line so close is the photo's edge itself.
const EDGE_CARD_LINE_MARGIN = 0.005;
// Of the four sides, at least this many must be lines seen in the photo.
const MIN_SEEN_SIDES = 2;
// A side at the photo's edge only shows where the photo ends: where the card ends is worked out from
// the card's shape and its two sides seen across it. A box is only taken when that lands at the
// photo's edge - from this far inside the photo (share of the card's size; further in, the card's own
// edge would have shown as a line) to this far beyond it.
const CUT_SIDE_INSIDE = 0.02;
const CUT_SIDE_BEYOND = 0.12;
// The least score (see edgeCardScore) for such a box - which is doubtful anyway: it counts once the
// number reads sure where the box says it is printed (see readCardPhoto in reader.js). Tuned on 117
// made-up photos of real cards cut so the card reaches the photo's edge, and 56 without a card (none
// of which gets a box from 1.5; 2 do from 1.3). The Dratini's box scores 2.03.
const MIN_EDGE_CARD_SCORE = 1.5;

function findCardAtPhotoEdge(photo) {
	const map = edgeMap(photo);
	const uprights = straightLines(map, true, EDGE_CARD_LINE_MARGIN);
	const crossings = straightLines(map, false, EDGE_CARD_LINE_MARGIN);
	// The photo's own edges, as lines that can be a side.
	const photoEdge = (isUpright, offset) => ({ isUpright: isUpright, lean: 0, slope: 0, offset: offset, photoEdge: true });
	const lefts = [photoEdge(true, 0), ...uprights];
	const rights = [...uprights, photoEdge(true, map.width)];
	const tops = [photoEdge(false, 0), ...crossings];
	const bottoms = [...crossings, photoEdge(false, map.height)];
	let best = null;
	for (const left of lefts) {
		for (const right of rights) {
			if (right.offset <= left.offset) continue;
			for (const top of tops) {
				for (const bottom of bottoms) {
					if (bottom.offset <= top.offset) continue;
					const sides = [left, right, top, bottom];
					// With no side at or close to the photo's edge, it is findCardByShape's box.
					if (!sides.some((side) => nearPhotoEdge(map, side))) continue;
					const atPhotoEdge = sides.map((side) => Boolean(side.photoEdge));
					if (atPhotoEdge.filter((edge) => !edge).length < MIN_SEEN_SIDES) continue;
					const box = { x0: left.offset, x1: right.offset, y0: top.offset, y1: bottom.offset };
					const width = box.x1 - box.x0;
					const height = box.y1 - box.y0;
					if (height < map.height * MIN_CARD_HEIGHT_SHARE) continue;
					if (Math.abs(width / height - CARD_SHAPE) > CARD_SHAPE_TOLERANCE) continue;
					// How much of each side seen really is an edge.
					let weakestSide = 1;
					if (!left.photoEdge) weakestSide = Math.min(weakestSide, lineSupport(map, left, box.y0, box.y1));
					if (!right.photoEdge) weakestSide = Math.min(weakestSide, lineSupport(map, right, box.y0, box.y1));
					if (!top.photoEdge) weakestSide = Math.min(weakestSide, lineSupport(map, top, box.x0, box.x1));
					if (!bottom.photoEdge) weakestSide = Math.min(weakestSide, lineSupport(map, bottom, box.x0, box.x1));
					if (weakestSide < MIN_SIDE_SUPPORT) continue;
					const whole = wholeCardPastEdge(map, box, atPhotoEdge);
					if (!whole) continue;
					const score = edgeCardScore(map, box, weakestSide, atPhotoEdge, uprights, crossings);
					if (!best || score > best.score) best = { box: whole, score: score };
				}
			}
		}
	}
	if (!best || best.score < MIN_EDGE_CARD_SCORE) return null;
	const scale = photo.width / map.width;
	return {
		x0: best.box.x0 * scale,
		x1: best.box.x1 * scale,
		y0: best.box.y0 * scale,
		y1: best.box.y1 * scale,
		foundBy: "shape, at the photo's edge",
		doubtful: true,
		atPhotoEdge: true,
	};
}

function nearPhotoEdge(map, line) {
	// The photo's own edge, or a line closer to it than findCardByShape looks.
	const across = line.isUpright ? map.width : map.height;
	return Boolean(line.photoEdge) || line.offset < across * PHOTO_EDGE_MARGIN || line.offset > across * (1 - PHOTO_EDGE_MARGIN);
}

function wholeCardPastEdge(map, box, atPhotoEdge) {
	// The card's whole box, which may run past the photo's edge. A side at the photo's edge is placed
	// where the card's shape puts it, when both sides across are lines: from the height, how wide the
	// card is, and the other way round. Both sides at the photo's edge (the card longer than the photo
	// is, that way): it runs past as far at each end. Null when a side placed that way doesn't land at
	// the photo's edge (see CUT_SIDE_INSIDE). With a side at the photo's edge each way (a corner of
	// the card cut off), its size can't be worked out: the part seen is taken.
	const [left, right, top, bottom] = atPhotoEdge;
	const whole = { ...box };
	if ((left || right) && !(top || bottom)) {
		const width = CARD_SHAPE * (box.y1 - box.y0);
		if (left && right) {
			whole.x0 = (map.width - width) / 2;
			whole.x1 = whole.x0 + width;
		} else if (left) {
			whole.x0 = box.x1 - width;
		} else {
			whole.x1 = box.x0 + width;
		}
		if (left && !landsAtEdge(whole.x0, width)) return null;
		if (right && !landsAtEdge(map.width - whole.x1, width)) return null;
	}
	if ((top || bottom) && !(left || right)) {
		const height = (box.x1 - box.x0) / CARD_SHAPE;
		if (top && bottom) {
			whole.y0 = (map.height - height) / 2;
			whole.y1 = whole.y0 + height;
		} else if (top) {
			whole.y0 = box.y1 - height;
		} else {
			whole.y1 = box.y0 + height;
		}
		if (top && !landsAtEdge(whole.y0, height)) return null;
		if (bottom && !landsAtEdge(map.height - whole.y1, height)) return null;
	}
	return whole;
}

function landsAtEdge(inside, cardSize) {
	// inside: how far a placed side lies inside the photo (below 0: beyond its edge).
	return inside <= cardSize * CUT_SIDE_INSIDE && inside >= -cardSize * CUT_SIDE_BEYOND;
}

function edgeCardScore(map, box, weakestSide, atPhotoEdge, uprights, crossings) {
	// As shapeScore, over the sides seen: the photo's edge has no colour change across it to measure
	// (weakestContrast leaves it out, as there is nothing outside it) and no border edge beside it.
	let score = weakestSide + weakestContrast(map, box) / CONTRAST_SCALE;
	if (borderEdgeFound(map, box, 1, uprights, crossings, atPhotoEdge)) score += BORDER_BONUS;
	if (borderEdgeFound(map, box, -1, uprights, crossings, atPhotoEdge)) score -= BORDER_BONUS;
	return score;
}

// ---------- For "Auto": a card-shaped thing in the camera's white frame ----------

// Auto (camera.js) only needs to know that something card-shaped fills the frame: the photo it then
// takes is looked at properly by findYellowCard and findCardByShape. So this asks less than
// findCardByShape - edges all round are enough, without the sharp colour change across them or the
// border just inside - as a dark card in a toploader on a dark cloth has neither. It looks only this
// far around the frame (share of the frame's size), so lines in the table or cloth around it can't
// crowd out the card's own.
const AROUND_FRAME = 0.15;

// All card-shaped boxes about the frame's place and size (fitsFrame in reader.js) with an edge along
// at least MIN_SIDE_SUPPORT of every side, strongest edges first. frame: the white frame's box in the
// picture. The boxes are given as shares of the picture's width and height.
function findCardShapesInFrame(picture, frame) {
	const frameWidth = frame.x1 - frame.x0;
	const frameHeight = frame.y1 - frame.y0;
	const area = {
		x0: Math.max(0, Math.round(frame.x0 - frameWidth * AROUND_FRAME)),
		x1: Math.min(picture.width, Math.round(frame.x1 + frameWidth * AROUND_FRAME)),
		y0: Math.max(0, Math.round(frame.y0 - frameHeight * AROUND_FRAME)),
		y1: Math.min(picture.height, Math.round(frame.y1 + frameHeight * AROUND_FRAME)),
	};
	const around = document.createElement("canvas");
	around.width = area.x1 - area.x0;
	around.height = area.y1 - area.y0;
	around.getContext("2d").drawImage(picture, -area.x0, -area.y0);
	const map = edgeMap(around);
	const scale = around.width / map.width;   // before the canvas is freed, which empties it
	freeCanvas(around);
	const uprights = straightLines(map, true);
	const crossings = straightLines(map, false);
	const found = [];
	for (const left of uprights) {
		for (const right of uprights) {
			if (right.offset <= left.offset) continue;
			for (const top of crossings) {
				for (const bottom of crossings) {
					if (bottom.offset <= top.offset) continue;
					const width = right.offset - left.offset;
					const height = bottom.offset - top.offset;
					if (Math.abs(width / height - CARD_SHAPE) > CARD_SHAPE_TOLERANCE) continue;
					// Back from the edge map to the picture.
					const box = {
						x0: area.x0 + left.offset * scale,
						x1: area.x0 + right.offset * scale,
						y0: area.y0 + top.offset * scale,
						y1: area.y0 + bottom.offset * scale,
					};
					if (!fitsFrame(box, frame)) continue;
					const weakestSide = Math.min(
						lineSupport(map, left, top.offset, bottom.offset),
						lineSupport(map, right, top.offset, bottom.offset),
						lineSupport(map, top, left.offset, right.offset),
						lineSupport(map, bottom, left.offset, right.offset),
					);
					if (weakestSide < MIN_SIDE_SUPPORT) continue;
					found.push({
						x0: box.x0 / picture.width,
						x1: box.x1 / picture.width,
						y0: box.y0 / picture.height,
						y1: box.y1 / picture.height,
						weakestSide: weakestSide,
					});
				}
			}
		}
	}
	return found.sort((a, b) => b.weakestSide - a.weakestSide);
}
