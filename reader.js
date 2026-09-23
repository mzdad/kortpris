"use strict";

// Turns a photo of a card into the text printed on it: its name and its collector number.
// It uses Tesseract, which reads text out of pictures (OCR = optical character recognition).

// Photos are resized to this length (longest side) before reading the text:
// huge phone photos would be slow, and small ones read better when enlarged.
const OCR_TARGET_SIDE_PX = 2000;
// Tesseract rates every word 0-100. Low scores are usually smudges in the artwork, not text.
const MIN_WORD_CONFIDENCE = 55;
// On the name's line, words much smaller than the biggest one are small print, not the name.
const NAME_SIZE_RATIO = 0.7;

// Words printed near the name that are never part of it.
const NOT_NAME_WORDS = new Set([
	"BASIC", "STAGE", "EVOLVES", "HP", "POKEMON", "POKÉMON", "TRAINER", "ITEM", "SUPPORTER",
	"STADIUM", "TOOL", "LV", "LEVEL", "PUT", "THIS", "CARD", "ON", "THE", "OF", "AND",
	"ABILITY", "POWER", "WEAKNESS", "RESISTANCE", "RETREAT", "COST", "ILLUS", "NO",
]);

let ocrWorkerPromise = null;
// Whoever is reading a photo right now gets Tesseract's progress reports.
let reportProgress = () => {};

// Reads a photo. onProgress(stage, fraction) is told "starting" first, "loading" while the
// reader downloads (first time only), then "reading" with a fraction from 0 to 1.
// Returns { name, number, photo } where photo is the resized picture, used later to compare looks.
async function readCardPhoto(imageFile, onProgress = () => {}) {
	reportProgress = onProgress;
	onProgress("starting", null);
	const photo = await photoToCanvas(imageFile);
	const worker = await getOcrWorker();
	// "blocks" gives every word with its size and position, which is how we find the name.
	const result = await worker.recognize(photo, {}, { text: true, blocks: true });
	return {
		name: guessCardName(result.data.blocks || []),
		number: guessCardNumber(result.data.text || ""),
		photo: photo,
	};
}

async function photoToCanvas(imageFile) {
	// createImageBitmap also turns sideways phone photos the right way up.
	const bitmap = await createImageBitmap(imageFile);
	const scale = OCR_TARGET_SIDE_PX / Math.max(bitmap.width, bitmap.height);
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
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

function guessCardName(blocks) {
	// The name is the biggest text on a card, so pick the line with the tallest real words.
	let bestName = "";
	let bestHeight = 0;
	for (const line of allLines(blocks)) {
		const words = nameWordsOnLine(line);
		if (words.length === 0) continue;
		const tallest = Math.max(...words.map((word) => word.height));
		const nameWords = words.filter((word) => word.height >= tallest * NAME_SIZE_RATIO);
		const name = nameWords.map((word) => word.text).join(" ");
		if (name.replace(/[^\p{L}]/gu, "").length < 3) continue;
		if (tallest > bestHeight) {
			bestHeight = tallest;
			bestName = name;
		}
	}
	return bestName;
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
		if (!text || word.confidence < MIN_WORD_CONFIDENCE || NOT_NAME_WORDS.has(upper)) continue;
		kept.push({ text: text, height: word.bbox.y1 - word.bbox.y0 });
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

function guessCardNumber(text) {
	// OCR often reads a zero as the letter O, so "4/1O2" is fixed to "4/102" first.
	const fixed = text.replace(/(?<=\d)[oO]|[oO](?=\d)/g, "0");
	// Collector numbers look like "4/102", "006/198" or "TG05/TG30".
	const match = fixed.match(/([A-Z]{0,3}\d{1,3})\s*\/\s*([A-Z]{0,3}\d{2,3})/);
	return match ? match[1] + "/" + match[2] : "";
}
