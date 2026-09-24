"use strict";

// Puts search results in order of how much each card's picture looks like the photo.
// This settles it when the text on the photo fits several cards, like the 200-odd Pikachus.
//
// How: the artwork window of the card in the photo, and of each candidate's picture, are both
// shrunk to a small grid of average colours - a blurry thumbnail - and compared cell by cell.
// The artwork is what tells same-named cards apart: the text and frame around it look alike
// on every card of an era. (Tested on a reverse holo Pikachu: comparing the whole card put the
// right one 51st of 213; comparing the artwork put it 2nd, behind the Jungle Pikachu that
// Legendary Collection reprinted with the very same artwork.)

// Size of the blurry thumbnail of the artwork, in cells. The artwork is wider than tall.
const LOOK_COLUMNS = 24;
const LOOK_ROWS = 14;
// Where the artwork window sits on a card, as shares of the card's width and height.
// Full-art cards simply have more artwork around it.
const ART_LEFT = 0.12;
const ART_RIGHT = 0.88;
const ART_TOP = 0.14;
const ART_BOTTOM = 0.47;
// A card is 63 mm wide and 88 mm tall.
const CARD_ASPECT = 63 / 88;
// The card's place in the photo is never exact, so the artwork is also tried a little shifted,
// bigger and smaller, and the best fit counts. With the card found by its yellow border, small
// nudges are enough; when its place is only estimated from its text, a wider search is needed.
const FOUND_SHIFTS = [-0.02, 0, 0.02];
const FOUND_SCALES = [0.96, 1, 1.04];
const ESTIMATED_SHIFTS = [-0.04, -0.02, 0, 0.02, 0.04];
const ESTIMATED_SCALES = [0.92, 0.96, 1, 1.04, 1.08];
// How far a card's edges are from the box around its text, as a share of that box.
const CARD_MARGIN_X = 0.09;
const CARD_MARGIN_TOP = 0.04;
const CARD_MARGIN_BOTTOM = 0.05;
// If the estimated card is this far off a real card's shape, the reader only found part of the text.
const ASPECT_TOLERANCE = 0.15;
// Without any text to go on, try the card filling this much of the photo's height.
const WHOLE_PHOTO_HEIGHTS = [0.6, 0.75, 0.9];
// The best-looking card counts as a clear winner when the runner-up is at least this many
// times further from the photo. In dev_reading_test.html (artwork comparison, version 1.9.0),
// right picks scored 2.1 to 12.9 and wrong picks never more than 1.13.
const CLEAR_WINNER_GAP = 2;
// A card from a set of the size the reader saw beats the best-looking card when it looks
// nearly as alike: at most this many times further from the photo. Cards with the very same
// artwork score within about 1.13 of each other; a different card at least twice as far.
const SET_SIZE_LOOK_SLACK = 1.5;

// Returns [{ card, distance }] sorted with the closest look first. Smaller distance = more alike.
// cardBox is where the card is in the photo when its yellow border showed it (reader.js);
// without it, the card's place is estimated from its text. onProgress(done, total) is told
// after each candidate's picture: with a few hundred of them, this takes a while.
async function rankByLook(photo, textArea, cards, cardBox = null, onProgress = () => {}) {
	const shifts = cardBox ? FOUND_SHIFTS : ESTIMATED_SHIFTS;
	const scales = cardBox ? FOUND_SCALES : ESTIMATED_SCALES;
	const photoGrids = [];
	for (const box of cardBox ? [cardBox] : possibleCardBoxes(photo, textArea)) {
		const artwork = artworkOf(box);
		for (const shiftX of shifts) {
			for (const shiftY of shifts) {
				for (const scale of scales) {
					photoGrids.push(colourGrid(photo, moveBox(artwork, shiftX, shiftY, scale)));
				}
			}
		}
	}

	let done = 0;
	const ranked = await Promise.all(cards.map(async (card) => {
		let distance = Infinity;   // a picture that doesn't load goes last
		try {
			const picture = await loadPicture(card.images.small);
			const cardGrid = colourGrid(picture, artworkOf({ x0: 0, y0: 0, x1: picture.width, y1: picture.height }));
			distance = Math.min(...photoGrids.map((grid) => gridDistance(grid, cardGrid)));
		} catch (error) {
			console.error(error);
		}
		done++;
		onProgress(done, cards.length);
		return { card, distance };
	}));
	ranked.sort((a, b) => a.distance - b.distance);
	return ranked;
}

function artworkOf(cardBox) {
	// The artwork window inside a card's box.
	const width = cardBox.x1 - cardBox.x0;
	const height = cardBox.y1 - cardBox.y0;
	return {
		x0: cardBox.x0 + width * ART_LEFT,
		x1: cardBox.x0 + width * ART_RIGHT,
		y0: cardBox.y0 + height * ART_TOP,
		y1: cardBox.y0 + height * ART_BOTTOM,
	};
}

// True when the first card in a rankByLook list is so much closer than the second
// that it is safe to open it without asking.
function isClearWinner(ranked) {
	if (ranked.length === 0) return false;
	if (ranked.length === 1) return true;
	// A picture that failed to load scores Infinity; that proves nothing either way.
	if (!Number.isFinite(ranked[0].distance) || !Number.isFinite(ranked[1].distance)) return false;
	return ranked[1].distance >= ranked[0].distance * CLEAR_WINNER_GAP;
}

// Decides what to show after rankByLook. Returns { cards, clear }: the cards in order, best
// first, and whether the first is sure enough to open without asking.
// - located: the reader found where the card sits in the photo, so its looks can be trusted.
// - setSizes: set sizes the reader saw ("102" of 8/102). They are often right even when the
//   card's own number isn't - but not always, so the picture has to agree.
// - setName: the set's name, when Claude read the card.
function pickBestMatch(ranked, located, setSizes = [], setName = "") {
	if (ranked.length === 0) return { cards: [], clear: false };
	const cards = ranked.map((entry) => entry.card);
	// Claude names the set. If exactly one candidate is from that set, that settles it.
	const fromSet = cards.filter((card) => sameSetName(card.set.name, setName));
	if (fromSet.length === 1) return { cards: moveToFront(cards, fromSet[0]), clear: true };
	if (!located) return { cards: cards, clear: false };

	// Among the cards that look nearly as much like the photo as the best one, exactly one
	// comes from a set of a size the reader saw: that is the one.
	const best = ranked[0].distance;
	const lookAlikes = ranked.filter((entry) =>
		Number.isFinite(entry.distance) && entry.distance <= best * SET_SIZE_LOOK_SLACK);
	const fromSetSize = lookAlikes.filter((entry) => setSizes.includes(String(entry.card.set.printedTotal)));
	if (fromSetSize.length === 1) return { cards: moveToFront(cards, fromSetSize[0].card), clear: true };

	return { cards: cards, clear: isClearWinner(ranked) };
}

function moveToFront(cards, card) {
	return [card, ...cards.filter((other) => other !== card)];
}

function sameSetName(a, b) {
	return lettersOnly(a || "") !== "" && lettersOnly(a || "") === lettersOnly(b || "");
}

function possibleCardBoxes(photo, textArea) {
	if (!textArea) {
		// No text found: guess a card in the middle of the photo, at a few sizes.
		return WHOLE_PHOTO_HEIGHTS.map((share) => boxAround(photo.width / 2, photo.height / 2, photo.height * share));
	}
	const width = textArea.x1 - textArea.x0;
	const height = textArea.y1 - textArea.y0;
	const box = {
		x0: textArea.x0 - width * CARD_MARGIN_X,
		x1: textArea.x1 + width * CARD_MARGIN_X,
		y0: textArea.y0 - height * CARD_MARGIN_TOP,
		y1: textArea.y1 + height * CARD_MARGIN_BOTTOM,
	};
	const boxWidth = box.x1 - box.x0;
	const boxHeight = box.y1 - box.y0;
	if (Math.abs(boxWidth / boxHeight - CARD_ASPECT) <= ASPECT_TOLERANCE) return [box];

	// The text only covers part of the card. Keep the text's width, give the box a real
	// card's height, and try it with the text at the top, middle and bottom of the card.
	const cardHeight = boxWidth / CARD_ASPECT;
	const centerX = (box.x0 + box.x1) / 2;
	return [
		boxAround(centerX, box.y0 + cardHeight / 2, cardHeight),
		boxAround(centerX, (box.y0 + box.y1) / 2, cardHeight),
		boxAround(centerX, box.y1 - cardHeight / 2, cardHeight),
	];
}

function boxAround(centerX, centerY, height) {
	const width = height * CARD_ASPECT;
	return { x0: centerX - width / 2, x1: centerX + width / 2, y0: centerY - height / 2, y1: centerY + height / 2 };
}

function moveBox(box, shiftShare, shiftShareY, scale) {
	const width = box.x1 - box.x0;
	const height = box.y1 - box.y0;
	const centerX = (box.x0 + box.x1) / 2 + width * shiftShare;
	const centerY = (box.y0 + box.y1) / 2 + height * shiftShareY;
	return {
		x0: centerX - width * scale / 2,
		x1: centerX + width * scale / 2,
		y0: centerY - height * scale / 2,
		y1: centerY + height * scale / 2,
	};
}

function colourGrid(source, box) {
	const small = shrink(source, box, LOOK_COLUMNS, LOOK_ROWS);
	const pixels = small.getContext("2d").getImageData(0, 0, LOOK_COLUMNS, LOOK_ROWS).data;
	const cells = LOOK_COLUMNS * LOOK_ROWS;
	const grid = new Float32Array(cells * 3);
	for (let channel = 0; channel < 3; channel++) {
		// Light makes a whole photo brighter, darker or more yellow. Measuring each cell
		// against the photo's own average and spread, per colour, cancels that out.
		let sum = 0;
		let sumOfSquares = 0;
		for (let cell = 0; cell < cells; cell++) {
			const value = pixels[cell * 4 + channel];
			sum += value;
			sumOfSquares += value * value;
		}
		const average = sum / cells;
		const spread = Math.sqrt(Math.max(sumOfSquares / cells - average * average, 1));
		for (let cell = 0; cell < cells; cell++) {
			grid[cell * 3 + channel] = (pixels[cell * 4 + channel] - average) / spread;
		}
	}
	return grid;
}

function gridDistance(gridA, gridB) {
	let total = 0;
	for (let i = 0; i < gridA.length; i++) {
		const difference = gridA[i] - gridB[i];
		total += difference * difference;
	}
	return total / gridA.length;
}

function shrink(source, box, width, height) {
	// Keep the box inside the picture.
	let x = Math.max(0, box.x0);
	let y = Math.max(0, box.y0);
	let boxWidth = Math.min(source.width, box.x1) - x;
	let boxHeight = Math.min(source.height, box.y1) - y;
	// Shrink in halves: one big jump would skip most pixels instead of averaging them.
	let current = source;
	while (boxWidth / 2 >= width * 2 && boxHeight / 2 >= height * 2) {
		const half = document.createElement("canvas");
		half.width = Math.round(boxWidth / 2);
		half.height = Math.round(boxHeight / 2);
		half.getContext("2d").drawImage(current, x, y, boxWidth, boxHeight, 0, 0, half.width, half.height);
		current = half;
		x = 0;
		y = 0;
		boxWidth = half.width;
		boxHeight = half.height;
	}
	const result = document.createElement("canvas");
	result.width = width;
	result.height = height;
	const ctx = result.getContext("2d", { willReadFrequently: true });
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(current, x, y, boxWidth, boxHeight, 0, 0, width, height);
	return result;
}

// The address to use for a card picture everywhere in the app, together with
// crossorigin="anonymous". The browser only lets a page read a picture's pixels when it was
// fetched that way. A copy cached from a plain fetch of the same address would be refused,
// so the added ending (which the image server ignores) keeps the two kinds apart.
function readablePictureUrl(url) {
	return url + "?readable";
}

function loadPicture(url) {
	// Waits for the "load" event rather than picture.decode(): browsers put decode() on hold
	// while the page is hidden (say, the phone switched to another app), and never give up.
	return new Promise((resolve, reject) => {
		const picture = new Image();
		picture.crossOrigin = "anonymous";
		picture.onload = () => resolve(picture);
		picture.onerror = () => reject(new Error("Card picture didn't load: " + url));
		picture.src = readablePictureUrl(url);
	});
}
