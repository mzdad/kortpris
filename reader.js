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

// Ways of telling Tesseract to read. tessedit_pageseg_mode picks how it looks for text:
// "11" = scattered bits anywhere (suits a card: text between pictures), "6" = one block,
// "7" = a single line. thresholding_method "2" turns the photo black-and-white one
// neighbourhood at a time, which copes with uneven light far better than the default.
const READING_MODES = {
	scattered: { tessedit_pageseg_mode: "11", thresholding_method: "2" },
	block: { tessedit_pageseg_mode: "6", thresholding_method: "2" },
	// On one short strip a single cut-off works fine, and it reads tiny print better.
	line: { tessedit_pageseg_mode: "7", thresholding_method: "0" },
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
// Returns { name, number, photo, textArea }: photo is the resized picture and textArea the
// box around the card's text in it, both used later to compare the card's looks.
async function readCardPhoto(imageFile, onProgress = () => {}) {
	reportProgress = onProgress;
	onProgress("starting", null);
	// createImageBitmap also turns sideways phone photos the right way up.
	const original = await createImageBitmap(imageFile);
	const photo = shrinkPhoto(original);
	const worker = await getOcrWorker();

	const firstRead = await readPage(worker, photo, "scattered");
	let name = guessCardName(firstRead.lines, firstRead.textArea);
	// No known Pokémon found: read the photo a second time, the other way.
	if (!name.sure) {
		const secondRead = await readPage(worker, photo, "block");
		const secondName = guessCardName(secondRead.lines, secondRead.textArea);
		if (secondName.sure || !name.text) name = secondName;
	}

	const number = await readCollectorNumber(worker, original, photo, firstRead);
	original.close();   // the full-size photo takes a lot of memory; it isn't needed any more
	return {
		name: name.text,
		number: number,
		photo: photo,
		textArea: firstRead.textArea,
	};
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

// Returns { text, sure }. "sure" means the text is a known Pokémon name.
function guessCardName(lines, textArea) {
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
		const pokemon = findPokemonName(words.map((word) => word.text));
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

function findPokemonName(words) {
	// Checks each word, and each pair of neighbouring words ("Mr. Mime", "Iron Treads"),
	// against the name list. The closest match on the line wins.
	let best = null;
	for (let i = 0; i < words.length; i++) {
		const tries = [words[i]];
		if (i + 1 < words.length) tries.push(words[i] + " " + words[i + 1]);
		for (const text of tries) {
			const match = matchPokemonName(text);
			if (match && (!best || match.mistakes < best.mistakes)) best = match;
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

async function readCollectorNumber(worker, original, photo, page) {
	// The number is tiny print on one of the card's bottom lines, too small to read in the
	// whole photo. So each of the lowest lines is read again on its own, enlarged - cut from
	// the full-size original, which has far more detail than the smaller copy.
	const toOriginal = original.width / photo.width;
	if (page.textArea) {
		for (const band of numberLineBands(page.lines, page.textArea)) {
			const bandInOriginal = {
				x0: band.x0 * toOriginal,
				x1: band.x1 * toOriginal,
				y0: band.y0 * toOriginal,
				y1: band.y1 * toOriginal,
			};
			await worker.setParameters(READING_MODES.line);
			const closeUp = cropAndZoom(original, bandInOriginal, NUMBER_ZOOM / toOriginal);
			const result = await worker.recognize(closeUp);
			const number = findCollectorNumber(result.data.text || "", true);
			if (number) return number;
		}
	}
	// Nothing up close: use whatever the whole-photo read saw, if it had a clear "/" in it.
	return findCollectorNumber(page.text, false);
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

function findCollectorNumber(text, allowWithoutSlash) {
	// OCR often reads a zero as the letter O: "4/1O2" -> "4/102".
	const fixed = text.replace(/(?<=\d)[oO]|[oO](?=\d)/g, "0");
	// Collector numbers look like "4/102", "006/198" or "TG05/TG30".
	const withSlash = fixed.match(/([A-Z]{0,3}\d{1,3})\s*\/\s*([A-Z]{0,3}\d{2,3})/);
	if (withSlash) return withSlash[1] + "/" + withSlash[2];
	if (!allowWithoutSlash) return "";
	// Tiny print often loses its "/": "4102" is really "4/102". Only runs of 3 to 6 digits
	// standing on their own count, so years and long copyright lines are skipped.
	for (const digits of fixed.match(/(?<!\d)\d{3,6}(?!\d)/g) || []) {
		const split = splitNumberAndTotal(digits);
		if (split) return split;
	}
	return "";
}

function splitNumberAndTotal(digits) {
	// A copyright year like "1999" or "2023" is not a card number.
	if (/^(19|20)\d\d$/.test(digits)) return "";
	// Newer cards pad both halves to three digits: "001132" is "001/132".
	if (digits.length === 6 && digits.startsWith("0")) return digits.slice(0, 3) + "/" + digits.slice(3);
	// Any other leading zero is noise, like "©2025" read as "02025".
	if (digits.startsWith("0")) return "";
	// Try "4/102" before "41/02": a set's total is usually three digits.
	for (const totalLength of [3, 2]) {
		const number = digits.slice(0, -totalLength);
		const total = digits.slice(-totalLength);
		if (number.length < 1 || number.length > 3 || total.startsWith("0")) continue;
		if (Number(number) === 0 || Number(number) > Number(total) * MAX_NUMBER_OVER_TOTAL) continue;
		return number + "/" + total;
	}
	return "";
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
