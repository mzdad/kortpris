"use strict";

// Turns a photo of a card into the text printed on it: its name and its collector number.
// It uses Tesseract, which reads text out of pictures (OCR = optical character recognition).
// dev_reading_test.html measures how well this works - run it after every change here.

// Photos are resized to this length (longest side) before reading.
const OCR_TARGET_SIDE_PX = 2000;
// Tesseract rates every word 0-100. Below this it is usually a smudge in the artwork, not text.
const MIN_WORD_CONFIDENCE = 55;
// Words checked against the Pokémon name list may be shakier: the list catches mistakes.
const MIN_NAME_CONFIDENCE = 30;
// On the name's line, words much smaller than the biggest one are small print, not the name.
const NAME_SIZE_RATIO = 0.7;
// The name is looked for in this top share of the card's text.
const NAME_ZONE_SHARE = 0.3;
// With fewer lines of text than this, the reader can't tell where the card is.
const MIN_TEXT_LINES = 3;
// Names shorter than this must be read exactly (like "Mew"). Longer ones may have one typo,
// and names this long or longer may have two.
const MIN_FUZZY_NAME_LETTERS = 4;
const LONG_NAME_LETTERS = 7;
// A name with its start or end cut off still counts if this share of it was read ("Umbreo").
const PARTIAL_NAME_SHARE = 0.6;
// The collector number is looked for among the lines in this bottom share of the card's text,
// trying at most this many lines, lowest first...
const NUMBER_ZONE_SHARE = 0.25;
const MAX_NUMBER_LINES = 3;
// ...each one enlarged this much, with this much room above and below (share of the line's height).
const NUMBER_ZOOM = 3;
const NUMBER_LINE_PADDING = 0.9;
// Even secret rares (like 215/203) have a number at most this many times the set's total.
const MAX_NUMBER_OVER_TOTAL = 1.6;
// No set is bigger than this: the biggest English sets have about 260 cards (Fusion Strike, 2021).
const MAX_SET_SIZE = 400;
// For sparkly foil cards: pixels lighter than this (0 = black, 255 = white) are wiped out,
// leaving only the near-black printed ink. Found on a reverse holo Pikachu (Legendary Collection).
const INK_CUTOFF = 90;
// Finding the card: most cards (1999 to 2024) have a bright yellow border, and tables, cloths,
// sleeves and toploaders don't. The photo is shrunk to this width to count yellow pixels...
const CARD_FINDER_WIDTH = 300;
// ...and a row or column counts as border when at least this share of it is yellow.
// Tuned on real photos of cards in toploaders on a patterned cloth.
const BORDER_YELLOW_SHARE = 0.4;
// A card is 63 x 88 mm. A found box further than this from that shape is not a card.
const CARD_SHAPE = 63 / 88;
const CARD_SHAPE_TOLERANCE = 0.08;
// The card is read with this much of the photo around it (share of its size), so nothing
// printed right at its edge is cut off.
const CARD_CROP_MARGIN = 0.02;
// Where the collector number is printed, as shares of the card's width and height: bottom
// right on cards up to 2016, bottom left from 2017 on. Only these small windows are read,
// because the text, lines and glitter around them make Tesseract misread the number.
const NUMBER_PLACES = [
	{ x0: 0.66, x1: 0.97, y0: 0.885, y1: 0.985 },   // bottom right
	{ x0: 0.03, x1: 0.40, y0: 0.885, y1: 0.985 },   // bottom left
];
// Each window is read in these ways, most useful first, until two reads agree on a number.
// Tesseract misreads tiny print differently each way, so together they read far more numbers
// than any one way alone: on 12 real photos 11, against at most 7 (version 1.10.0).
// cardWidth: how wide the whole card would be at that enlargement, in pixels.
// ink: "soft" or "hard" for a black-ink-only copy (see inkAgainstBackground), "" for the photo itself.
const NUMBER_READS = [
	{ cardWidth: 3750, ink: "soft", mode: "numberScattered" },
	{ cardWidth: 3000, ink: "", mode: "numberBlock" },
	{ cardWidth: 3750, ink: "soft", mode: "numberBlock" },
	{ cardWidth: 2400, ink: "hard", mode: "numberScattered" },
];
// Black-ink-only copies: a pixel this dark compared to the background around it (or darker)
// turns black, and this light turns white; "hard" copies cut at one point instead.
const INK_BLACK_AT = 0.45;
const INK_WHITE_AT = 0.95;
const INK_HARD_CUTOFF = 0.72;
// The background around a pixel is a smooth blur of this size (share of the window's width):
// much wider than a letter, so the letters hardly darken it.
const INK_BACKGROUND_BLUR = 1 / 25;
// At most this many possible numbers are handed on to the search.
const MAX_NUMBER_GUESSES = 5;

// Ways of telling Tesseract to read. tessedit_pageseg_mode picks how it looks for text:
// "11" = scattered bits anywhere (suits a card: text between pictures), "6" = one block,
// "7" = a single line. thresholding_method "2" turns the photo black-and-white one
// neighbourhood at a time, which copes with uneven light far better than the default.
const READING_MODES = {
	scattered: { tessedit_pageseg_mode: "11", thresholding_method: "2" },
	block: { tessedit_pageseg_mode: "6", thresholding_method: "2" },
	// On one short strip a single cut-off works fine, and it reads tiny print better.
	line: { tessedit_pageseg_mode: "7", thresholding_method: "0" },
	// For the ink-only copy of a foil card (see inkOnly).
	ink: { tessedit_pageseg_mode: "6", thresholding_method: "0" },
	// For the windows around the collector number (see NUMBER_READS).
	numberBlock: { tessedit_pageseg_mode: "6", thresholding_method: "2" },
	numberScattered: { tessedit_pageseg_mode: "11", thresholding_method: "0" },
};

// Words printed near the name that are never part of it.
const NOT_NAME_WORDS = new Set([
	"BASIC", "STAGE", "EVOLVES", "HP", "POKEMON", "POKÉMON", "TRAINER", "ITEM", "SUPPORTER",
	"STADIUM", "TOOL", "LV", "LEVEL", "PUT", "THIS", "CARD", "ON", "THE", "OF", "AND",
	"ABILITY", "POWER", "WEAKNESS", "RESISTANCE", "RETREAT", "COST", "ILLUS", "NO",
]);

// The name list (pokemon-names.js) in the plain-letters form used for comparing.
const POKEMON_KEYS = POKEMON_NAMES.map((name) => ({ name: name, key: lettersOnly(name) }));

let ocrWorkerPromise = null;
// Whoever is reading a photo right now gets Tesseract's progress reports.
let reportProgress = () => {};

// Reads a photo. onProgress(stage, fraction) is told "starting" first, "loading" while the
// reader downloads (first time only), then "reading" with a fraction from 0 to 1.
// Returns { name, nameSure, number, numberGuesses, photo, textArea, cardBox }:
// - nameSure means the name is a known Pokémon.
// - number is the likeliest collector number; numberGuesses all possible ones, likeliest first.
// - photo is the resized picture. textArea (around the card's text) and cardBox (the card, found
//   by its yellow border, or null) are boxes in it, used later to compare the card's looks.
async function readCardPhoto(imageFile, onProgress = () => {}) {
	reportProgress = onProgress;
	onProgress("starting", null);
	// createImageBitmap also turns sideways phone photos the right way up.
	const original = await createImageBitmap(imageFile);
	const photo = shrinkPhoto(original);
	const worker = await getOcrWorker();

	// When the card's yellow border shows where it is, only the card is read - not the table,
	// cloth or toploader around it, whose patterns look like made-up letters.
	const cardBox = findYellowCard(photo);
	const view = cardBox ? cardView(photo, cardBox) : { picture: photo, x0: 0, y0: 0, zoom: 1 };

	const firstRead = await readPage(worker, view.picture, "scattered");
	let name = guessCardName(firstRead.lines, firstRead.textArea);
	// No known Pokémon found: read it a second time, the other way.
	if (!name.sure) {
		const secondRead = await readPage(worker, view.picture, "block");
		const secondName = guessCardName(secondRead.lines, secondRead.textArea);
		if (secondName.sure || !name.text) name = secondName;
	}
	// Still nothing: maybe a sparkly foil card, whose glitter looks like hundreds of tiny letters.
	// Read a copy with only the dark ink left. Glitter can still fake a close-enough name
	// ("Seel"), so only an exact Pokémon name counts from this read.
	if (!name.sure) {
		const inkRead = await readPage(worker, inkOnly(view.picture), "ink");
		const inkName = guessCardName(inkRead.lines, inkRead.textArea, 0);
		if (inkName.sure) name = inkName;
	}

	const numberGuesses = await readCollectorNumbers(worker, original, photo, cardBox, firstRead);
	original.close();   // the full-size photo takes a lot of memory; it isn't needed any more
	return {
		name: name.text,
		nameSure: name.sure,
		number: numberGuesses[0] || "",
		numberGuesses: numberGuesses,
		photo: photo,
		textArea: boxInPhoto(firstRead.textArea, view),
		cardBox: cardBox,
	};
}

// ---------- Where the card is ----------

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

function cardView(photo, cardBox) {
	// The card cut out of the photo, with a little margin, enlarged to the usual reading size.
	const marginX = (cardBox.x1 - cardBox.x0) * CARD_CROP_MARGIN;
	const marginY = (cardBox.y1 - cardBox.y0) * CARD_CROP_MARGIN;
	const area = {
		x0: Math.max(0, cardBox.x0 - marginX),
		y0: Math.max(0, cardBox.y0 - marginY),
		x1: Math.min(photo.width, cardBox.x1 + marginX),
		y1: Math.min(photo.height, cardBox.y1 + marginY),
	};
	const zoom = OCR_TARGET_SIDE_PX / Math.max(area.x1 - area.x0, area.y1 - area.y0);
	return { picture: cropAndZoom(photo, area, zoom), x0: area.x0, y0: area.y0, zoom: zoom };
}

function boxInPhoto(box, view) {
	// A box found in the cut-out card, moved back to where it is in the whole photo.
	if (!box) return null;
	return {
		x0: view.x0 + box.x0 / view.zoom,
		y0: view.y0 + box.y0 / view.zoom,
		x1: view.x0 + box.x1 / view.zoom,
		y1: view.y0 + box.y1 / view.zoom,
	};
}

function inkOnly(picture) {
	// A copy of the picture in pure black and white: black where the ink is dark, white elsewhere.
	const copy = document.createElement("canvas");
	copy.width = picture.width;
	copy.height = picture.height;
	const ctx = copy.getContext("2d", { willReadFrequently: true });
	ctx.drawImage(picture, 0, 0);
	const image = ctx.getImageData(0, 0, copy.width, copy.height);
	const pixels = image.data;
	for (let i = 0; i < pixels.length; i += 4) {
		// How bright the pixel looks to the eye: green counts most, blue least.
		const brightness = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
		const value = brightness < INK_CUTOFF ? 0 : 255;
		pixels[i] = value;
		pixels[i + 1] = value;
		pixels[i + 2] = value;
	}
	ctx.putImageData(image, 0, 0);
	return copy;
}

function shrinkPhoto(original) {
	// Most of the reading works on a smaller copy of the photo: a 12-megapixel phone
	// photo would be slow, and small photos read better when enlarged.
	const scale = OCR_TARGET_SIDE_PX / Math.max(original.width, original.height);
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(original.width * scale);
	canvas.height = Math.round(original.height * scale);
	canvas.getContext("2d").drawImage(original, 0, 0, canvas.width, canvas.height);
	return canvas;
}

function getOcrWorker() {
	// The text reader downloads a few megabytes the first time, so it is created once and reused.
	if (!ocrWorkerPromise) {
		ocrWorkerPromise = Tesseract.createWorker("eng", 1, {
			logger: (message) => {
				// Tesseract reports what it is doing, plus how far along it is from 0 to 1.
				if (message.status === "recognizing text") reportProgress("reading", message.progress);
				else reportProgress("loading", null);
			},
		});
		ocrWorkerPromise.catch(() => { ocrWorkerPromise = null; });   // allow a fresh try next photo
	}
	return ocrWorkerPromise;
}

async function readPage(worker, picture, mode) {
	await worker.setParameters(READING_MODES[mode]);
	// "blocks" gives every line and word with its size and position.
	const result = await worker.recognize(picture, {}, { text: true, blocks: true });
	const lines = allLines(result.data.blocks || []);
	return { text: result.data.text || "", lines: lines, textArea: findTextArea(lines) };
}

function allLines(blocks) {
	const lines = [];
	for (const block of blocks) {
		for (const paragraph of block.paragraphs || []) {
			lines.push(...(paragraph.lines || []));
		}
	}
	return lines;
}

function findTextArea(lines) {
	// The box around every word the reader is confident about. On a card photo that is
	// the card itself, minus a thin border, because the table around it has no text.
	let area = null;
	let linesWithText = 0;
	for (const line of lines) {
		const sureWords = (line.words || []).filter((word) =>
			word.confidence >= MIN_WORD_CONFIDENCE && cleanWord(word.text) !== "");
		if (sureWords.length === 0) continue;
		linesWithText++;
		for (const word of sureWords) {
			if (!area) area = { ...word.bbox };
			area.x0 = Math.min(area.x0, word.bbox.x0);
			area.y0 = Math.min(area.y0, word.bbox.y0);
			area.x1 = Math.max(area.x1, word.bbox.x1);
			area.y1 = Math.max(area.y1, word.bbox.y1);
		}
	}
	// A couple of words are not enough to say where the card is.
	return linesWithText >= MIN_TEXT_LINES ? area : null;
}

// ---------- The name ----------

// Returns { text, sure }. "sure" means the text is a known Pokémon name, read with at most
// maxMistakes wrong letters (the default allows the usual typos, see countMistakes).
function guessCardName(lines, textArea, maxMistakes = Infinity) {
	// The name is the biggest text near the top of the card. Only the top part counts,
	// because further down some cards print their attack names even bigger.
	const zoneBottom = textArea ? textArea.y0 + (textArea.y1 - textArea.y0) * NAME_ZONE_SHARE : Infinity;
	let best = { text: "", size: 0, sure: false };
	for (const line of lines) {
		const words = nameWordsOnLine(line);
		if (words.length === 0) continue;
		if (Math.min(...words.map((word) => word.top)) > zoneBottom) continue;
		// Tesseract's row height measures the letter size of the whole line. It is steadier
		// than the box around a single word, which can come out far too tall.
		const tallest = Math.max(...words.map((word) => word.height));
		const size = line.rowAttributes ? line.rowAttributes.rowHeight : tallest;

		// A known Pokémon name always beats text that isn't one.
		const pokemon = findPokemonName(words.map((word) => word.text), maxMistakes);
		if (pokemon) {
			if (!best.sure || size > best.size) best = { text: pokemon, size: size, sure: true };
			continue;
		}
		if (best.sure) continue;

		// Not a Pokémon (maybe a Trainer card): remember the biggest confident text, just in case.
		const plainWords = words.filter((word) =>
			word.confidence >= MIN_WORD_CONFIDENCE && word.height >= tallest * NAME_SIZE_RATIO);
		const text = plainWords.map((word) => word.text).join(" ");
		if (lettersOnly(text).length >= 3 && size > best.size) best = { text: text, size: size, sure: false };
	}
	return best;
}

function nameWordsOnLine(line) {
	const kept = [];
	let skipNext = false;
	for (const word of line.words || []) {
		const text = cleanWord(word.text);
		const upper = text.toUpperCase();
		if (skipNext) {
			skipNext = false;
			continue;
		}
		// "Evolves from Charmeleon": the word after "from" is the previous Pokémon, not this one.
		if (upper === "FROM") {
			skipNext = true;
			continue;
		}
		if (!text || word.confidence < MIN_NAME_CONFIDENCE || NOT_NAME_WORDS.has(upper)) continue;
		kept.push({
			text: text,
			confidence: word.confidence,
			height: word.bbox.y1 - word.bbox.y0,
			top: word.bbox.y0,
		});
	}
	return kept;
}

function cleanWord(rawWord) {
	// Trim stray symbols from the edges, keeping the few that real names use:
	// Mr. Mime, Farfetch'd, Porygon-Z.
	const trimmed = rawWord.replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}.']+$/u, "");
	if (!/^\p{L}[\p{L}.'’-]*$/u.test(trimmed)) return "";   // digits or odd symbols: not a name
	if (trimmed.replace(/[^\p{L}]/gu, "").length < 2) return "";
	return trimmed;
}

function findPokemonName(words, maxMistakes = Infinity) {
	// Checks each word, and each pair of neighbouring words ("Mr. Mime", "Iron Treads"),
	// against the name list. The closest match on the line wins.
	let best = null;
	for (let i = 0; i < words.length; i++) {
		const tries = [words[i]];
		if (i + 1 < words.length) tries.push(words[i] + " " + words[i + 1]);
		for (const text of tries) {
			const match = matchPokemonName(text);
			if (!match || match.mistakes > maxMistakes) continue;
			if (!best || match.mistakes < best.mistakes) best = match;
		}
	}
	return best ? best.name : "";
}

function matchPokemonName(text) {
	// Finds the Pokémon a possibly misread word is: "Pikachy" -> Pikachu, "Umbreo" -> Umbreon.
	// Returns { name, mistakes }, or null when nothing is close enough, or when two
	// Pokémon are equally close - then it can't be sure which one it is.
	const read = lettersOnly(text);
	if (read.length < 3) return null;
	let best = null;
	let tied = false;
	for (const pokemon of POKEMON_KEYS) {
		const mistakes = countMistakes(read, pokemon.key);
		if (mistakes === null) continue;
		if (!best || mistakes < best.mistakes) {
			best = { name: pokemon.name, mistakes: mistakes };
			tied = false;
		} else if (mistakes === best.mistakes) {
			tied = true;
		}
	}
	return best && !tied ? best : null;
}

function countMistakes(read, name) {
	// How many letters are wrong, or null when it is too different to count as a match.
	if (read === name) return 0;
	if (read.length < MIN_FUZZY_NAME_LETTERS) return null;
	// The start or end of the name was cut off: "umbreo" in "umbreon", "kachu" in "pikachu".
	if (name.includes(read) && read.length >= name.length * PARTIAL_NAME_SHARE) return 1;
	const allowed = read.length >= LONG_NAME_LETTERS ? 2 : 1;
	const distance = editDistance(read, name, allowed);
	return distance <= allowed ? distance : null;
}

function editDistance(a, b, limit) {
	// The fewest single-letter changes (add, remove, swap) that turn a into b.
	// Stops early, returning limit + 1, once the answer is known to be above limit.
	if (Math.abs(a.length - b.length) > limit) return limit + 1;
	let previous = Array.from({ length: b.length + 1 }, (unused, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		let rowBest = i;
		for (let j = 1; j <= b.length; j++) {
			const change = a[i - 1] === b[j - 1] ? 0 : 1;
			current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + change);
			rowBest = Math.min(rowBest, current[j]);
		}
		if (rowBest > limit) return limit + 1;
		previous = current;
	}
	return previous[b.length];
}

function lettersOnly(text) {
	// "Farfetch'd" -> "farfetchd", "Flabébé" -> "flabebe": only plain letters are compared.
	return text.normalize("NFD").replace(/[^A-Za-z]/g, "").toLowerCase();
}

// ---------- The collector number ----------

async function readCollectorNumbers(worker, original, photo, cardBox, page) {
	// The number is tiny print along the card's bottom edge, too small to read in the whole
	// photo, so that part is read again, enlarged - cut from the full-size original, which has
	// far more detail. Tiny print is often misread, so this returns every number that seems
	// possible, likeliest first: the search tries them in turn, and the card database says
	// which one exists.
	const toOriginal = original.width / photo.width;
	let guesses = [];
	if (cardBox) {
		guesses = await readNumberPlaces(worker, original, scaleBox(cardBox, toOriginal));
	} else if (page.textArea) {
		// Without the card's outline, the lowest lines of text are read one at a time instead
		// (page.lines are in the photo's own measurements).
		await worker.setParameters(READING_MODES.line);
		for (const strip of numberLineBands(page.lines, page.textArea)) {
			const closeUp = cropAndZoom(original, scaleBox(strip, toOriginal), NUMBER_ZOOM / toOriginal);
			const result = await worker.recognize(closeUp);
			guesses.push(...oncePerNumber(numberCandidates(result.data.text || "")));
		}
	}
	// Also whatever the first read of the card saw, when it clearly had a "/" in it.
	guesses.push(...oncePerNumber(numberCandidates(page.text).filter((guess) => guess.sawSlash)));
	return likeliestNumbers(guesses).slice(0, MAX_NUMBER_GUESSES);
}

async function readNumberPlaces(worker, original, card) {
	// Reads the windows where the number can be (card is the card's box in the original),
	// in each of the ways in NUMBER_READS. When two reads agree on a number with its "/",
	// that is as sure as reading gets, and the remaining ways are skipped to save time.
	const guesses = [];
	const cardWidth = card.x1 - card.x0;
	const cardHeight = card.y1 - card.y0;
	for (const way of NUMBER_READS) {
		await worker.setParameters(READING_MODES[way.mode]);
		for (const place of NUMBER_PLACES) {
			const area = {
				x0: card.x0 + cardWidth * place.x0,
				x1: card.x0 + cardWidth * place.x1,
				y0: card.y0 + cardHeight * place.y0,
				y1: card.y0 + cardHeight * place.y1,
			};
			let closeUp = cropAndZoom(original, area, way.cardWidth / cardWidth);
			if (way.ink) closeUp = inkAgainstBackground(closeUp, way.ink);
			const result = await worker.recognize(closeUp);
			guesses.push(...oncePerNumber(numberCandidates(result.data.text || "")));
		}
		const agreed = likeliestVotes(guesses)[0];
		if (agreed && agreed.sawSlash && agreed.votes >= 2) break;
	}
	return guesses;
}

function oncePerNumber(guesses) {
	// One read can hold the same number twice; it still counts as one vote.
	const seen = new Set();
	return guesses.filter((guess) => {
		if (seen.has(guess.number)) return false;
		seen.add(guess.number);
		return true;
	});
}

function likeliestNumbers(guesses) {
	return likeliestVotes(guesses).map((entry) => entry.number);
}

function likeliestVotes(guesses) {
	// Each number once, with how many reads found it. Numbers read with their "/" come first,
	// then the ones more reads agreed on, then the ones found earliest.
	const tally = new Map();
	guesses.forEach((guess, order) => {
		if (!tally.has(guess.number)) tally.set(guess.number, { number: guess.number, sawSlash: false, votes: 0, order: order });
		const entry = tally.get(guess.number);
		entry.votes++;
		if (guess.sawSlash) entry.sawSlash = true;
	});
	return [...tally.values()].sort((a, b) =>
		Number(b.sawSlash) - Number(a.sawSlash) || b.votes - a.votes || a.order - b.order);
}

function scaleBox(box, scale) {
	return { x0: box.x0 * scale, x1: box.x1 * scale, y0: box.y0 * scale, y1: box.y1 * scale };
}

// A copy of a close-up with only the black printed ink left, for reading small print on a
// coloured card. Black ink is dark in all three colours (red, green, blue), while every card
// background - red, purple, green, yellow, even foil glitter - is bright in at least one. So
// each pixel is judged by its brightest colour, compared with the average around it, which
// also evens out shadows and glare. style "soft" keeps shades of grey at the edges of the
// letters; "hard" is pure black and white.
function inkAgainstBackground(picture, style) {
	const width = picture.width;
	const height = picture.height;
	const copy = document.createElement("canvas");
	copy.width = width;
	copy.height = height;
	const ctx = copy.getContext("2d", { willReadFrequently: true });
	ctx.drawImage(picture, 0, 0);
	const image = ctx.getImageData(0, 0, width, height);
	const pixels = image.data;
	const brightest = new Float32Array(width * height);
	for (let i = 0; i < brightest.length; i++) {
		brightest[i] = Math.max(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
	}
	const background = smoothBlur(brightest, width, height, Math.max(2, Math.round(width * INK_BACKGROUND_BLUR)));
	for (let i = 0; i < brightest.length; i++) {
		// 1 = as light as its surroundings, lower = darker than them.
		const darkness = brightest[i] / Math.max(1, background[i]);
		let value;
		if (style === "hard") {
			value = darkness < INK_HARD_CUTOFF ? 0 : 255;
		} else {
			const share = (darkness - INK_BLACK_AT) / (INK_WHITE_AT - INK_BLACK_AT);
			value = Math.round(Math.max(0, Math.min(1, share)) * 255);
		}
		pixels[i * 4] = value;
		pixels[i * 4 + 1] = value;
		pixels[i * 4 + 2] = value;
	}
	ctx.putImageData(image, 0, 0);
	return copy;
}

function smoothBlur(values, width, height, radius) {
	// Three box blurs one after the other look just like a smooth (Gaussian) blur of about
	// this radius. (A canvas blur filter does the same, but not every phone browser has one.)
	let result = values;
	for (let pass = 0; pass < 3; pass++) {
		result = boxBlur(result, width, height, radius, true);
		result = boxBlur(result, width, height, radius, false);
	}
	return result;
}

function boxBlur(values, width, height, radius, alongRows) {
	// Each pixel becomes the average of the pixels up to radius away along its row (or column).
	// Near the picture's edge, only the pixels that exist count.
	const result = new Float32Array(values.length);
	const lines = alongRows ? height : width;
	const length = alongRows ? width : height;
	const step = alongRows ? 1 : width;
	for (let line = 0; line < lines; line++) {
		const start = alongRows ? line * width : line;
		let sum = 0;
		let count = 0;
		for (let i = 0; i <= Math.min(radius, length - 1); i++) {
			sum += values[start + i * step];
			count++;
		}
		for (let i = 0; i < length; i++) {
			result[start + i * step] = sum / count;
			// Slide the window on by one pixel: it gains one at the far end and loses one behind.
			const gained = i + radius + 1;
			const lost = i - radius;
			if (gained < length) {
				sum += values[start + gained * step];
				count++;
			}
			if (lost >= 0) {
				sum -= values[start + lost * step];
				count--;
			}
		}
	}
	return result;
}

function numberLineBands(lines, area) {
	// Strips across the full card width (the number can sit at either end of its line),
	// one per text line near the bottom, lowest first. A line that was never recognised
	// is covered by one last strip just below the lowest text.
	const areaWidth = area.x1 - area.x0;
	const areaHeight = area.y1 - area.y0;
	const zoneTop = area.y1 - areaHeight * NUMBER_ZONE_SHARE;
	const zoneBottom = area.y1 + areaHeight * 0.08;
	const across = { x0: area.x0 - areaWidth * 0.08, x1: area.x1 + areaWidth * 0.08 };

	const bands = [];
	const lowestFirst = lines
		.filter((line) => line.bbox.y0 >= zoneTop && line.bbox.y1 <= zoneBottom)
		.sort((a, b) => b.bbox.y1 - a.bbox.y1);
	for (const line of lowestFirst) {
		const middle = (line.bbox.y0 + line.bbox.y1) / 2;
		// Several bits of text on the same row share one strip.
		if (bands.some((band) => middle >= band.y0 && middle <= band.y1)) continue;
		const padding = (line.bbox.y1 - line.bbox.y0) * NUMBER_LINE_PADDING;
		bands.push({ ...across, y0: line.bbox.y0 - padding, y1: line.bbox.y1 + padding });
		if (bands.length === MAX_NUMBER_LINES) break;
	}
	bands.push({ ...across, y0: area.y1 - areaHeight * 0.01, y1: area.y1 + areaHeight * 0.06 });
	return bands;
}

// Returns [{ number, sawSlash }]: every collector number that text could hold, like "10/130".
// sawSlash means a "/" was actually read, which makes it far more trustworthy.
function numberCandidates(text) {
	// OCR often reads a zero as the letter O: "4/1O2" -> "4/102".
	let cleaned = text.replace(/(?<=\d)[oO]|[oO](?=\d)/g, "0");
	// A slash in tiny print can come out as an apostrophe: "13'64" is 13/64. Only straight
	// between digits, so a height like "4' 11"" stays what it is.
	cleaned = cleaned.replace(/(?<=\d)['’](?=\d)/g, "/");
	cleaned = fixDigitLookalikes(cleaned);
	// Numbers printed near the collector number that are never it: Pokédex numbers ("#157",
	// "No. 157"), levels ("LV. 57") and years ("©1995-2000").
	cleaned = cleaned
		.replace(/(#|No\.?\s*|LV\.?\s*)\d+/gi, " ")
		.replace(/(?<!\d)(19|20)\d\d(?!\d)/g, " ");

	const found = [];
	// "4/102", "006/198", "TG05/TG30". Tiny print can turn the "/" into "|" or "\".
	for (const match of cleaned.matchAll(/([A-Z]{0,3}\d{1,3})\s*[\/|\\]\s*([A-Z]{0,3}\d{2,3})(?!\d)/g)) {
		if (Number(match[2]) > MAX_SET_SIZE) continue;   // plain digits only; "TG30" gives NaN
		found.push({ number: match[1] + "/" + match[2], sawSlash: true });
	}
	// The "/" can also vanish altogether ("4102") or turn into a digit ("107130").
	for (const digits of cleaned.match(/(?<!\d)\d{4,6}(?!\d)/g) || []) {
		for (const number of splitNumberAndTotal(digits)) found.push({ number: number, sawSlash: false });
	}
	return found;
}

// Letters that tiny digits are often misread as.
const DIGIT_LOOKALIKES = {
	B: "8", S: "5", s: "5", I: "1", l: "1", i: "1", "!": "1", Z: "2", z: "2",
	G: "6", g: "9", T: "7", D: "0", Q: "0", O: "0", o: "0",
};

function fixDigitLookalikes(text) {
	// Something shaped like a collector number with a letter or two in it: "B/102" is 8/102,
	// "1S/64" is 15/64. At least two real digits are needed, so ordinary words stay words,
	// and set codes like "TG05/TG30" are left alone because a letter comes right before them.
	const numberShape = /(?<![A-Za-z0-9])([0-9BSsIli!ZzGgTDQOo]{1,3})\s*[\/|\\]\s*([0-9BSsIli!ZzGgTDQOo]{2,3})(?![A-Za-z0-9])/g;
	return text.replace(numberShape, (whole, number, total) => {
		const realDigits = (number + total).replace(/[^0-9]/g, "").length;
		if (realDigits < 2) return whole;
		const asDigits = (part) => part.split("").map((character) => DIGIT_LOOKALIKES[character] || character).join("");
		return asDigits(number) + "/" + asDigits(total);
	});
}

function splitNumberAndTotal(digits) {
	// Every way a run of digits could be "number/total", likeliest first.
	// Newer cards pad both halves to three digits: "001132" is "001/132".
	if (digits.length === 6 && digits.startsWith("0")) return [digits.slice(0, 3) + "/" + digits.slice(3)];
	// Any other leading zero is noise, like "©2025" read as "02025".
	if (digits.startsWith("0")) return [];
	const splits = [];
	// The "/" simply lost: "4102" is "4/102". A set's total is usually three digits.
	addSplit(splits, digits.slice(0, -3), digits.slice(-3));
	addSplit(splits, digits.slice(0, -2), digits.slice(-2));
	// The "/" misread as a 7 or a 1 - both look a lot like it: "107130" is "10/130".
	for (let i = 1; i < digits.length - 1; i++) {
		if (digits[i] === "7" || digits[i] === "1") addSplit(splits, digits.slice(0, i), digits.slice(i + 1));
	}
	return splits;
}

function addSplit(splits, number, total) {
	if (number.length < 1 || number.length > 3 || total.length < 2 || total.length > 3) return;
	if (total.startsWith("0") || Number(number) === 0 || Number(total) > MAX_SET_SIZE) return;
	if (Number(number) > Number(total) * MAX_NUMBER_OVER_TOTAL) return;
	const text = number + "/" + total;
	if (!splits.includes(text)) splits.push(text);
}

function cropAndZoom(picture, box, zoom) {
	// Copies one part of a picture into a new picture, zoom times the size.
	// The box is first trimmed to the picture's edges.
	const x0 = Math.max(0, Math.floor(box.x0));
	const y0 = Math.max(0, Math.floor(box.y0));
	const x1 = Math.min(picture.width, Math.ceil(box.x1));
	const y1 = Math.min(picture.height, Math.ceil(box.y1));
	const result = document.createElement("canvas");
	result.width = Math.max(1, Math.round((x1 - x0) * zoom));
	result.height = Math.max(1, Math.round((y1 - y0) * zoom));
	const ctx = result.getContext("2d");
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(picture, x0, y0, x1 - x0, y1 - y0, 0, 0, result.width, result.height);
	return result;
}
