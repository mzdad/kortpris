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

// ---------- Straightening a card seen at an angle ----------

// A copy of a quadrilateral of the picture, stretched flat into a picture width x height: the card as it
// would look photographed straight on. corners: the quadrilateral's corners in the picture, [top-left,
// top-right, bottom-right, bottom-left], each { x, y }. Only the pixels inside it are read from the picture,
// so a 12-megapixel photo isn't copied whole. Outside the picture the copy is white.
function flattenedPicture(picture, corners, width, height) {
	const around = {
		x0: Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x)) - 2)),
		y0: Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y)) - 2)),
		x1: Math.min(picture.width, Math.ceil(Math.max(...corners.map((c) => c.x)) + 2)),
		y1: Math.min(picture.height, Math.ceil(Math.max(...corners.map((c) => c.y)) + 2)),
	};
	const sourceWidth = around.x1 - around.x0;
	const sourceHeight = around.y1 - around.y0;
	const source = document.createElement("canvas");
	source.width = sourceWidth;
	source.height = sourceHeight;
	const sourceContext = source.getContext("2d", { willReadFrequently: true });
	sourceContext.drawImage(picture, -around.x0, -around.y0);
	const from = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight).data;
	const flat = document.createElement("canvas");
	flat.width = width;
	flat.height = height;
	const flatContext = flat.getContext("2d", { willReadFrequently: true });
	const to = flatContext.createImageData(width, height);
	// Every pixel of the flat copy is looked up in the picture, where the map says it lies, and blended
	// from the four pixels around that place.
	const map = flatToPicture(corners, width, height);
	const lastX = sourceWidth - 1;
	const lastY = sourceHeight - 1;
	let out = 0;
	for (let v = 0; v < height; v++) {
		for (let u = 0; u < width; u++) {
			const scale = map[6] * u + map[7] * v + 1;
			const x = (map[0] * u + map[1] * v + map[2]) / scale - around.x0;
			const y = (map[3] * u + map[4] * v + map[5]) / scale - around.y0;
			if (x >= 0 && y >= 0 && x <= lastX && y <= lastY) {
				const x0 = Math.min(Math.floor(x), lastX - 1);
				const y0 = Math.min(Math.floor(y), lastY - 1);
				const shareX = x - x0;
				const shareY = y - y0;
				const at = (y0 * sourceWidth + x0) * 4;
				const below = sourceWidth * 4;
				for (let colour = 0; colour < 3; colour++) {
					const top = from[at + colour] * (1 - shareX) + from[at + 4 + colour] * shareX;
					const bottom = from[at + below + colour] * (1 - shareX) + from[at + below + 4 + colour] * shareX;
					to.data[out + colour] = top * (1 - shareY) + bottom * shareY;
				}
			} else {
				to.data[out] = to.data[out + 1] = to.data[out + 2] = 255;
			}
			to.data[out + 3] = 255;
			out += 4;
		}
	}
	flatContext.putImageData(to, 0, 0);
	return flat;
}

// The perspective map from a flat picture width x height to a quadrilateral of the photo: 8 numbers a to h,
// where the flat point (u, v) is at x = (a*u + b*v + c) / (g*u + h*v + 1) and y = (d*u + e*v + f) / (g*u + h*v + 1)
// in the photo. The corners of the flat picture go to the four corners given (top-left, top-right,
// bottom-right, bottom-left); the eight numbers are found by solving the eight equations that says.
function flatToPicture(corners, width, height) {
	const flatCorners = [[0, 0], [width, 0], [width, height], [0, height]];
	const rows = [];
	flatCorners.forEach(([u, v], index) => {
		const { x, y } = corners[index];
		rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
		rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
	});
	// Gaussian elimination: each row in turn is made the only one with a number in its column.
	for (let column = 0; column < 8; column++) {
		let pivot = column;
		for (let row = column + 1; row < 8; row++) {
			if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
		}
		[rows[column], rows[pivot]] = [rows[pivot], rows[column]];
		for (let row = 0; row < 8; row++) {
			if (row === column) continue;
			const factor = rows[row][column] / rows[column][column];
			for (let k = column; k < 9; k++) rows[row][k] -= factor * rows[column][k];
		}
	}
	return rows.map((row, index) => row[8] / row[index]);
}

// A card photographed at an angle - in a binder pocket, say, from below - has slanted sides, and its
// edge against a white pocket or a grey table is faint: findCardByShape wants straight, sharp edges. This
// looks for four lines the way it does (long straight edges, found by a Hough transform), but:
// - the lines may lean more (SLANT_MAX_LEAN), each side its own way, so the card is a quadrilateral;
// - an edge counts by how much brighter the one side is than the other, added up along the whole line
//   (not by how many pixels pass a fixed test): a faint edge that keeps the same sign along its length
//   adds up to a lot, where the texture around it (a pocket's dots, a cloth) adds up and cancels;
// - the four sides of a card all change the same way: the card is darker than its surroundings all round, or
//   lighter all round, so the left and top edges change one way and the right and bottom edges the other.
// Only a fallback: it runs when reading the photo as it is found nothing (see readCardPhoto).
const SLANT_MAX_LEAN = 12;
const SLANT_LEAN_STEP = 0.5;
const SLANT_LINES_TRIED = 26;
// A pixel votes only when the picture changes at least this much across it (grey levels over 4 pixels).
const SLANT_MIN_CHANGE = 6;
// Sides of a card seen at an angle may differ this much in length (longest / shortest): 1 is a rectangle.
const SLANT_MAX_SIDE_RATIO = 1.3;
// Width / height, in the photo, of a card seen at an angle: 63 / 88 seen from a little above or below.
const SLANT_SHAPE_MIN = 0.6;
const SLANT_SHAPE_MAX = 0.86;
// ...most likely this, and a box this much off (in the same units) is half as likely.
const SLANT_SHAPE_LIKELY = 0.72;
const SLANT_SHAPE_SPREAD = 0.12;
// A box with a smaller one inside it that scores at least this share as well, and whose border is at least this quiet
// (see ringQuiet), counts only this much of its score: it is a case round the card.
const SLANT_INNER_AS_GOOD = 0.5;
const SLANT_INNER_MIN_RING = 0.4;
const SLANT_OUTER_PENALTY = 0.4;
// The least change across a side (grey levels between the bands beyond and inside it, the middle of them along it).
const SLANT_MIN_SIDE_STRENGTH = 12;
// The most candidates given, and how alike two boxes may be (share of their joint area they share) to count as the same.
const SLANT_MOST_CANDIDATES = 3;
// How many boxes have their sides refined (see refinedSlantedCard)...
const SLANT_REFINED = 12;
// ...each side moved up to this many map pixels, and its lean changed up to this many degrees, to where the picture changes most.
const SLANT_REFINE_SHIFT = 2;
const SLANT_REFINE_LEAN = 1;
const SLANT_SAME_CARD = 0.8;

// Up to SLANT_MOST_CANDIDATES boxes that may be the card, best first, each { corners, score }: corners are
// [top-left, top-right, bottom-right, bottom-left] in the photo, each { x, y }.
function findSlantedCards(photo) {
	const map = slantMap(photo);
	const lefts = slantLines(map, true);
	const tops = slantLines(map, false);
	const found = [];
	for (const left of lefts) {
		for (const right of lefts) {
			// Left and right edges change the brightness opposite ways.
			if (right.offset <= left.offset || Math.sign(right.sum) === Math.sign(left.sum)) continue;
			for (const top of tops) {
				if (Math.sign(top.sum) !== Math.sign(left.sum)) continue;
				for (const bottom of tops) {
					if (bottom.offset <= top.offset || Math.sign(bottom.sum) === Math.sign(top.sum)) continue;
					const corners = [slantCorner(left, top, map), slantCorner(right, top, map), slantCorner(right, bottom, map), slantCorner(left, bottom, map)];
					const candidate = scoreSlantedCard(map, corners, [left, right, top, bottom]);
					if (candidate) found.push(candidate);
				}
			}
		}
	}
	found.sort((a, b) => b.score - a.score);
	// The best few different boxes have their sides moved to where each edge is clearest (the lines found are
	// a pixel or so off, and a degree or so in their lean), and are scored again.
	const distinct = [];
	for (const candidate of found) {
		if (distinct.length === SLANT_REFINED) break;
		if (distinct.some((other) => quadsOverlap(other.corners, candidate.corners) >= SLANT_SAME_CARD)) continue;
		distinct.push(candidate);
	}
	const refined = distinct.map((candidate) => refinedSlantedCard(map, candidate) || candidate);
	// A card has cases around it - a toploader, a sleeve, a binder's pocket - whose edges are as clear, and which
	// are the same shape. When a smaller box lies inside one and is nearly as good, the smaller is the card.
	for (const candidate of refined) {
		const inner = refined.some((other) => other !== candidate && boxInside(other.corners, candidate.corners)
			&& other.score >= candidate.score * SLANT_INNER_AS_GOOD && other.ring >= SLANT_INNER_MIN_RING);
		candidate.rank = inner ? candidate.score * SLANT_OUTER_PENALTY : candidate.score;
	}
	refined.sort((a, b) => b.rank - a.rank);
	const chosen = [];
	for (const candidate of refined) {
		if (chosen.length === SLANT_MOST_CANDIDATES) break;
		if (chosen.some((other) => quadsOverlap(other.corners, candidate.corners) >= SLANT_SAME_CARD)) continue;
		chosen.push(candidate);
	}
	// Back from the map to the photo.
	const scale = photo.width / map.width;
	return chosen.map((candidate) => ({ score: candidate.score, strengths: candidate.strengths, ring: candidate.ring, shape: candidate.shape, corners: candidate.corners.map((corner) => ({ x: corner.x * scale, y: corner.y * scale })) }));
}

function slantMap(photo) {
	// The picture's brightness at SHAPE_FINDER_WIDTH wide, and how much it changes across (gx) and down (gy),
	// over 4 pixels, with its sign.
	const width = SHAPE_FINDER_WIDTH;
	const height = Math.round(photo.height * width / photo.width);
	const small = document.createElement("canvas");
	small.width = width;
	small.height = height;
	const ctx = small.getContext("2d", { willReadFrequently: true });
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(photo, 0, 0, width, height);
	const pixels = ctx.getImageData(0, 0, width, height).data;
	const grey = new Float32Array(width * height);
	for (let i = 0; i < grey.length; i++) grey[i] = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
	const gx = new Float32Array(width * height);
	const gy = new Float32Array(width * height);
	for (let y = 2; y < height - 2; y++) {
		for (let x = 2; x < width - 2; x++) {
			gx[y * width + x] = grey[y * width + x + 2] - grey[y * width + x - 2];
			gy[y * width + x] = grey[(y + 2) * width + x] - grey[(y - 2) * width + x];
		}
	}
	return { width, height, grey, gx, gy };
}

// The most promising lines of one direction, each { isUpright, lean, slope, offset, sum }: as straightLines, but
// a line's sum is the changes across it added up with their signs (positive: brighter to its right or
// below, negative: darker), so a line of faint edges that all change the same way beats one of short strong ones.
function slantLines(map, isUpright, count = SLANT_LINES_TRIED) {
	const changes = isUpright ? map.gx : map.gy;
	const across = isUpright ? map.width : map.height;
	const leans = [];
	for (let lean = -SLANT_MAX_LEAN; lean <= SLANT_MAX_LEAN + 1e-9; lean += SLANT_LEAN_STEP) leans.push(lean);
	const slopes = leans.map((lean) => Math.tan(lean * Math.PI / 180));
	const sums = leans.map(() => new Float32Array(across));
	for (let y = 0; y < map.height; y++) {
		for (let x = 0; x < map.width; x++) {
			const change = changes[y * map.width + x];
			if (Math.abs(change) < SLANT_MIN_CHANGE) continue;
			const position = isUpright ? x : y;
			const along = isUpright ? y - map.height / 2 : x - map.width / 2;
			for (let k = 0; k < leans.length; k++) {
				const offset = Math.round(position - along * slopes[k]);
				if (offset >= 0 && offset < across) sums[k][offset] += change;
			}
		}
	}
	const all = [];
	for (let k = 0; k < leans.length; k++) {
		for (let offset = 1; offset < across - 1; offset++) {
			// The neighbouring offsets are added, as a blurred edge or a slightly different lean spreads over them.
			const sum = sums[k][offset - 1] + sums[k][offset] + sums[k][offset + 1];
			all.push({ isUpright: isUpright, lean: leans[k], slope: slopes[k], offset: offset, sum: sum });
		}
	}
	all.sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum));
	const chosen = [];
	for (const line of all) {
		if (chosen.length === count) break;
		if (line.offset < across * PHOTO_EDGE_MARGIN || line.offset > across * (1 - PHOTO_EDGE_MARGIN)) continue;
		if (chosen.some((other) => Math.abs(other.offset - line.offset) <= 5 && Math.abs(other.lean - line.lean) <= 2.5)) continue;
		chosen.push(line);
	}
	return chosen;
}

function slantCorner(upright, crossing, map) {
	// Where an upright line meets a crossing one.
	const y = (crossing.offset + (upright.offset - (map.height / 2) * upright.slope - map.width / 2) * crossing.slope) / (1 - upright.slope * crossing.slope);
	const x = upright.offset + (y - map.height / 2) * upright.slope;
	return { x: x, y: y };
}

// { score, corners } for four lines that may be a card's sides, or null when they can't be.
function scoreSlantedCard(map, corners, lines) {
	const [topLeft, topRight, bottomRight, bottomLeft] = corners;
	const top = topRight.x - topLeft.x;
	const bottom = bottomRight.x - bottomLeft.x;
	const left = bottomLeft.y - topLeft.y;
	const right = bottomRight.y - topRight.y;
	if (Math.min(top, bottom, left, right) <= 0) return null;
	if (Math.max(top, bottom) / Math.min(top, bottom) > SLANT_MAX_SIDE_RATIO) return null;
	if (Math.max(left, right) / Math.min(left, right) > SLANT_MAX_SIDE_RATIO) return null;
	const height = (left + right) / 2;
	if (height < map.height * MIN_CARD_HEIGHT_SHARE) return null;
	const shape = (top + bottom) / 2 / height;
	if (shape < SLANT_SHAPE_MIN || shape > SLANT_SHAPE_MAX) return null;
	// Every corner inside the photo, give or take a little.
	for (const corner of corners) {
		if (corner.x < -map.width * 0.03 || corner.x > map.width * 1.03 || corner.y < -map.height * 0.03 || corner.y > map.height * 1.03) return null;
	}
	const [leftLine, rightLine, topLine, bottomLine] = lines;
	const strengths = [
		sideStrength(map, leftLine, topLeft.y, bottomLeft.y),
		sideStrength(map, rightLine, topRight.y, bottomRight.y),
		sideStrength(map, topLine, topLeft.x, topRight.x),
		sideStrength(map, bottomLine, bottomLeft.x, bottomRight.x),
	];
	const weakest = Math.min(...strengths);
	if (weakest < SLANT_MIN_SIDE_STRENGTH) return null;
	// Of boxes with edges as clear, the one nearest a card's shape is likelier the card: a text box inside it, or
	// a toploader round it, is seldom the same shape...
	const offShape = (shape - SLANT_SHAPE_LIKELY) / SLANT_SHAPE_SPREAD;
	// ...and the one with a border of one colour just inside its edges: a card's own. Inside the edge of a text
	// box or the artwork there is print or a picture.
	const ring = ringQuiet(map, corners);
	return { score: weakest * ring / (1 + offShape * offShape), corners: corners, lines: lines, strengths: strengths, shape: shape, ring: ring };
}

// How even the band just inside the four sides is, from 0 (print or a picture there) to 1 (one colour, as a
// card's border is). Each side is sampled along its length at SLANT_RING_DEPTHS (shares of the box's width) in
// from the edge; the brightness's spread along the side, on average, says how even it is.
const SLANT_RING_DEPTHS = [0.015, 0.025, 0.035];
// A spread of this many grey levels halves the quietness.
const SLANT_RING_SPREAD = 18;

function ringQuiet(map, corners) {
	const width = (Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) + Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y)) / 2;
	let total = 0;
	let count = 0;
	for (let side = 0; side < 4; side++) {
		const from = corners[side];
		const to = corners[(side + 1) % 4];
		const length = Math.hypot(to.x - from.x, to.y - from.y);
		// The direction along the side, and the one pointing into the box (the box's corners run clockwise).
		const alongX = (to.x - from.x) / length;
		const alongY = (to.y - from.y) / length;
		const inX = -alongY;
		const inY = alongX;
		for (const depth of SLANT_RING_DEPTHS) {
			const values = [];
			// The middle of the side: its ends are the corners, rounded and lit differently.
			for (let along = length * 0.15; along <= length * 0.85; along += 2) {
				const x = Math.round(from.x + alongX * along + inX * depth * width);
				const y = Math.round(from.y + alongY * along + inY * depth * width);
				if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
				values.push(map.grey[y * map.width + x]);
			}
			if (values.length < 5) continue;
			const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
			total += Math.sqrt(values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length);
			count++;
		}
	}
	if (count === 0) return 0;
	const spread = total / count / SLANT_RING_SPREAD;
	return 1 / (1 + spread * spread);
}

// The same box with each side moved to where the picture changes most across it along its length, then scored
// again; null when it no longer is a card's shape.
function refinedSlantedCard(map, candidate) {
	const [topLeft, topRight, bottomRight, bottomLeft] = candidate.corners;
	const [left, right, top, bottom] = candidate.lines;
	const lines = [
		bestSlantedLine(map, left, topLeft.y, bottomLeft.y),
		bestSlantedLine(map, right, topRight.y, bottomRight.y),
		bestSlantedLine(map, top, topLeft.x, topRight.x),
		bestSlantedLine(map, bottom, bottomLeft.x, bottomRight.x),
	];
	const corners = [slantCorner(lines[0], lines[2], map), slantCorner(lines[1], lines[2], map), slantCorner(lines[1], lines[3], map), slantCorner(lines[0], lines[3], map)];
	return scoreSlantedCard(map, corners, lines);
}

function bestSlantedLine(map, line, from, to) {
	// Among the lines near this one, the one with the most change across it, the same way, along from..to.
	const changes = line.isUpright ? map.gx : map.gy;
	const length = line.isUpright ? map.height : map.width;
	const across = line.isUpright ? map.width : map.height;
	const start = Math.max(2, Math.round(Math.min(from, to)));
	const end = Math.min(length - 3, Math.round(Math.max(from, to)));
	const sign = Math.sign(line.sum);
	let best = line;
	let bestTotal = -Infinity;
	for (let leanChange = -SLANT_REFINE_LEAN; leanChange <= SLANT_REFINE_LEAN + 1e-9; leanChange += SLANT_LEAN_STEP) {
		const lean = line.lean + leanChange;
		const slope = Math.tan(lean * Math.PI / 180);
		for (let shift = -SLANT_REFINE_SHIFT; shift <= SLANT_REFINE_SHIFT; shift++) {
			const offset = line.offset + shift;
			let total = 0;
			for (let along = start; along <= end; along++) {
				const at = Math.round(offset + (along - length / 2) * slope);
				if (at < 2 || at >= across - 2) continue;
				const change = sign * changes[line.isUpright ? along * map.width + at : at * map.width + along];
				// A very strong change (a line of print) counts no more than a clear edge.
				total += Math.min(change, SLANT_REFINE_CAP);
			}
			if (total > bestTotal) {
				bestTotal = total;
				best = { isUpright: line.isUpright, lean: lean, slope: slope, offset: offset, sum: line.sum };
			}
		}
	}
	return best;
}
const SLANT_REFINE_CAP = 60;

function sideStrength(map, line, from, to) {
	// How much brighter (or darker, as the line's own sign says) the band just beyond a side is than the band
	// just inside it, the same way all along it: the middle of the differences measured at places along the
	// side from `from` to `to`. Two bands of SLANT_BAND pixels, not just the pixels either side of the edge: a
	// thin line of print, dark against light on both its sides, then comes to nothing, where a card's edge, with
	// the table on one side and the border on the other, keeps its whole step. Low where the side is broken up
	// or the picture changes the other way.
	const isUpright = line.isUpright;
	const length = isUpright ? map.height : map.width;
	const across = isUpright ? map.width : map.height;
	const sign = Math.sign(line.sum);
	const seen = [];
	const start = Math.max(0, Math.round(Math.min(from, to)));
	const end = Math.min(length - 1, Math.round(Math.max(from, to)));
	for (let along = start; along <= end; along += 2) {
		const position = line.offset + (along - length / 2) * line.slope;
		const before = bandMean(map, isUpright, along, position - SLANT_BAND_FAR, position - SLANT_BAND_NEAR, across);
		const after = bandMean(map, isUpright, along, position + SLANT_BAND_NEAR, position + SLANT_BAND_FAR, across);
		if (before === null || after === null) continue;
		seen.push(sign * (after - before));
	}
	if (seen.length === 0) return 0;
	seen.sort((a, b) => a - b);
	return seen[Math.floor(seen.length / 2)];
}

// The bands each side of an edge are measured over: from this many pixels from the line to this many.
const SLANT_BAND_NEAR = 2;
const SLANT_BAND_FAR = 7;

function bandMean(map, isUpright, along, from, to, across) {
	// The mean brightness of the pixels of one row (or column) from `from` to `to` across it, or null when it is out of the picture.
	const first = Math.round(from);
	const last = Math.round(to);
	if (first < 0 || last >= across || along < 0 || along >= (isUpright ? map.height : map.width)) return null;
	let sum = 0;
	for (let at = first; at <= last; at++) sum += map.grey[isUpright ? along * map.width + at : at * map.width + along];
	return sum / (last - first + 1);
}

function boxInside(inner, outer) {
	// The inner quadrilateral's bounding box lies within the outer's (a little to spare).
	const box = (corners) => ({
		x0: Math.min(...corners.map((c) => c.x)), x1: Math.max(...corners.map((c) => c.x)),
		y0: Math.min(...corners.map((c) => c.y)), y1: Math.max(...corners.map((c) => c.y)),
	});
	const small = box(inner);
	const big = box(outer);
	const slack = (big.x1 - big.x0) * 0.02;
	return small.x0 >= big.x0 - slack && small.x1 <= big.x1 + slack && small.y0 >= big.y0 - slack && small.y1 <= big.y1 + slack
		&& (small.x1 - small.x0) * (small.y1 - small.y0) < (big.x1 - big.x0) * (big.y1 - big.y0) * 0.95;
}

function quadsOverlap(a, b) {
	// The share of two quadrilaterals' joint area (as bounding boxes: close enough) that they share.
	const box = (corners) => ({
		x0: Math.min(...corners.map((c) => c.x)), x1: Math.max(...corners.map((c) => c.x)),
		y0: Math.min(...corners.map((c) => c.y)), y1: Math.max(...corners.map((c) => c.y)),
	});
	const one = box(a);
	const other = box(b);
	const shared = Math.max(0, Math.min(one.x1, other.x1) - Math.max(one.x0, other.x0)) * Math.max(0, Math.min(one.y1, other.y1) - Math.max(one.y0, other.y0));
	const area = (each) => (each.x1 - each.x0) * (each.y1 - each.y0);
	return shared / (area(one) + area(other) - shared);
}
