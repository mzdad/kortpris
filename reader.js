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
// Trainer and Energy names are often longer ("Double Colorless Energy"): one more typo is allowed
// for every this many letters beyond LONG_NAME_LETTERS, and they can be up to this many words.
const LETTERS_PER_EXTRA_TYPO = 8;
const MAX_NAME_WORDS = 7;
// "Evolves from Galarian Linoone": after "from", up to this many words name the Pokémon this one
// evolves from - not this one.
const MAX_EVOLVES_FROM_WORDS = 3;
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
// The card is read with this much of the photo around it (share of its size), so nothing
// printed right at its edge is cut off.
const CARD_CROP_MARGIN = 0.02;
// A photo from the app's own camera comes with the white frame the viewer filled with the card
// (see readCardPhoto). The card's own edges, found close to the frame, are more exact than it: at
// most this share of the frame's size from its middle...
const FRAME_CENTRE_SLACK = 0.12;
// ...and from this to this share of its width.
const FRAME_SIZE_SLACK = { min: 0.7, max: 1.15 };
// A card placed by the frame alone is cut out with this much margin: it may have been held a
// little bigger than the frame.
const FRAME_CROP_MARGIN = 0.08;
// Where the name is printed, as shares of the card's width and height: along the top, left of
// the HP on a Pokémon, under the "Trainer" banner on a Trainer card. On full-art cards the name
// is printed on the artwork itself, and a read of the whole card often loses it there, so this
// strip is also read on its own, enlarged (see readNameStrip).
const NAME_STRIP = { x0: 0.03, x1: 0.78, y0: 0.015, y1: 0.15 };
// How wide the whole card would be at the strip's enlargement, in pixels. (1400 read one name
// fewer in the fake photos of dev_fullart_test.html, and it is no quicker: each read of the strip
// takes about a second either way.)
const NAME_STRIP_CARD_WIDTH = 2000;
// A name's letters are at least this tall, as a share of the card's height: 1.9% to 9.5% on 27
// full-art cards. A known name made up of smaller print in the strip is a bit of the picture or
// the small print ("alot" in the noise of a photo is one letter from Swalot).
const NAME_MIN_HEIGHT = 0.015;
// Ways of reading the name strip, in turn, until one finds a known name: the photo itself, only
// its dark ink, and only its light ink - white letters, as on many full-art cards.
const NAME_STRIP_READS = [
	{ ink: "", mode: "block" },
	{ ink: "dark", mode: "ink" },
	{ ink: "light", mode: "ink" },
];
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
// ink: "soft" or "hard" for a black-ink-only copy (see inkAgainstBackground), "white" for a copy of
// only the near-white print (see whiteInkOnly), "" for the photo itself.
// The last way is for numbers printed white on full-art cards and dark cards, italic and edged in
// black. A copy judged against the colours around it, like the black-ink ones, breaks those up (as
// tried in version 1.28.0, when it read none of them); judged against the window's own whitest
// print, they come out whole.
const NUMBER_READS = [
	{ cardWidth: 3750, ink: "soft", mode: "numberScattered" },
	{ cardWidth: 3000, ink: "", mode: "numberBlock" },
	{ cardWidth: 3750, ink: "soft", mode: "numberBlock" },
	{ cardWidth: 2400, ink: "hard", mode: "numberScattered" },
	{ cardWidth: 2000, ink: "white", mode: "numberBlock" },
];
// When the reads of the card's own cut don't agree, the number places are read again from other
// cuts of the card, in turn, until two reads agree: its box a tenth bigger around its middle, then
// moved up a little (a share of its height). The box is never found exactly, and tiny print cut out
// a little differently often reads differently. On 62 photos of real cards whose first reads didn't
// agree (40 photos and 120 made-up variants of them), the right number came first in 39 instead of
// 21, and was among the guesses in 46 instead of 33 (version 1.30.0). A cut a twentieth bigger, one
// moved down and one enlarged more did less.
const NUMBER_RECUTS = [
	{ scale: 1.1, up: 0 },
	{ scale: 1, up: 0.012 },
];
// On a card fewer pixels tall than this in the full-size photo - a small scan, or a picture from the
// web - the collector number is under 12 pixels high: reading its place, cut after cut, only costs
// time (6.6 seconds for nothing on a 450-pixel scan). A card in a phone's photo is 2,000 or more.
const MIN_CARD_PIXELS_FOR_NUMBER = 700;
// Where cards since 2023 print their set's code (see set-codes.js): in a little box in the
// bottom-left corner, before the number - as shares of the card's width and height. The code box
// itself is about x 0.09-0.16 and y 0.94-0.97; the "place" is a little bigger, as the card's edges
// are never found exactly, and the "box" just around it.
const SET_CODE_PLACE = { x0: 0.07, x1: 0.19, y0: 0.925, y1: 0.985 };
const SET_CODE_BOX = { x0: 0.08, x1: 0.175, y0: 0.935, y1: 0.98 };
// The code is read in these ways, in turn, until one finds a code that fits the number read. It is
// printed white - in a black box on light cards, a white-edged one on dark cards - so only the light
// ink is kept (see inkAgainstBackground). On 33 made-up photos of cards from 2023 to 2026, the first
// way read 17 codes, the three together 22, and none wrong (version 1.40.0).
const SET_CODE_READS = [
	{ place: SET_CODE_PLACE, cardWidth: 2000, mode: "setCode" },
	{ place: SET_CODE_BOX, cardWidth: 2000, mode: "setCodeLine" },
	{ place: SET_CODE_BOX, cardWidth: 1400, mode: "setCodeLine" },
];
// What tiny capitals in a code are misread as ("0BF" is OBF, "S5P" is SSP).
const CODE_LETTER_LOOKALIKES = { 0: "O", 1: "I", 5: "S", 6: "G", 8: "B" };
// Black-ink-only copies: a pixel this dark compared to the background around it (or darker)
// turns black, and this light turns white; "hard" copies cut at one point instead.
const INK_BLACK_AT = 0.45;
const INK_WHITE_AT = 0.95;
const INK_HARD_CUTOFF = 0.72;
// The background around a pixel is a smooth blur of this size (share of the window's width):
// much wider than a letter, so the letters hardly darken it.
const INK_BACKGROUND_BLUR = 1 / 25;
// White-print copies (see whiteInkOnly): a pixel counts as white print when its darkest colour is
// at least this share of the whitest print's. The whitest print is the lightest pixel but for this
// small share of them (a glint of glare).
const WHITE_INK_SHARE = 0.88;
const WHITEST_SKIPPED = 0.005;
// At most this many possible numbers are handed on to the search.
const MAX_NUMBER_GUESSES = 5;
// Stands in for a card's own number when only the set size after the "/" could be read: "?/110".
const UNREAD_NUMBER = "?";

// Ways of telling Tesseract to read. tessedit_pageseg_mode picks how it looks for text:
// "11" = scattered bits anywhere (suits a card: text between pictures), "6" = one block,
// "7" = a single line. thresholding_method "2" turns the photo black-and-white one
// neighbourhood at a time, which copes with uneven light far better than the default.
// tessedit_char_whitelist: the only characters it may read, or "" for any. Every mode says it, as
// Tesseract keeps a setting until it is changed.
const ANY_CHARACTER = "";
const READING_MODES = {
	scattered: { tessedit_pageseg_mode: "11", thresholding_method: "2", tessedit_char_whitelist: ANY_CHARACTER },
	block: { tessedit_pageseg_mode: "6", thresholding_method: "2", tessedit_char_whitelist: ANY_CHARACTER },
	// On one short strip a single cut-off works fine, and it reads tiny print better.
	line: { tessedit_pageseg_mode: "7", thresholding_method: "0", tessedit_char_whitelist: ANY_CHARACTER },
	// For the ink-only copy of a foil card (see inkOnly).
	ink: { tessedit_pageseg_mode: "6", thresholding_method: "0", tessedit_char_whitelist: ANY_CHARACTER },
	// For the windows around the collector number (see NUMBER_READS).
	numberBlock: { tessedit_pageseg_mode: "6", thresholding_method: "2", tessedit_char_whitelist: ANY_CHARACTER },
	numberScattered: { tessedit_pageseg_mode: "11", thresholding_method: "0", tessedit_char_whitelist: ANY_CHARACTER },
	// For the set's code by the number (see readSetCode): capitals and digits only, as that is all
	// a code holds. Allowed any character, Tesseract read "PAF" as "PAfo" and "SVI" as "Svia".
	setCode: { tessedit_pageseg_mode: "6", thresholding_method: "0", tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" },
	setCodeLine: { tessedit_pageseg_mode: "7", thresholding_method: "0", tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" },
};

// Words printed near the name that are never part of it.
const NOT_NAME_WORDS = new Set([
	"BASIC", "STAGE", "EVOLVES", "HP", "POKEMON", "POKÉMON", "TRAINER", "ITEM", "SUPPORTER",
	"STADIUM", "TOOL", "LV", "LEVEL", "PUT", "THIS", "CARD", "ON", "THE", "OF", "AND",
	"ABILITY", "POWER", "WEAKNESS", "RESISTANCE", "RETREAT", "COST", "ILLUS", "NO",
]);

// The name lists (pokemon-names.js, card-names.js) in the plain-letters form used for comparing.
const POKEMON_KEYS = POKEMON_NAMES.map((name) => ({ name: name, key: lettersOnly(name) }));
const OTHER_CARD_KEYS = [...TRAINER_NAMES, ...ENERGY_NAMES].map((name) => ({ name: name, key: lettersOnly(name) }));
// Black Star promo cards have a code instead of a number out of a set size: "SWSH193", "SM60".
const PROMO_NUMBER = /(?<![A-Za-z])(SWSH|HGSS|SM|XY|BW|DP)\s?(\d{1,3}|0\d{3})(?!\d)/gi;
// A few cards of older sets are numbered the same way: "SH10", "SL1", "RT1", "AR1". Only in
// capitals and without a space, as printed: small print like "aR 7" is no number.
const OLD_CODE_NUMBER = /(?<![A-Za-z0-9])(SH|SL|RT|AR)(\d{1,2})(?![A-Za-z0-9\/])/g;
// Scarlet & Violet promos print their set's code, the language and the number: "SVP EN 001".
// The code sits white on black in a little box, and is only now and then read.
const SVP_NUMBER = /SVP[^\d\/]{0,6}?(\d{1,3})(?![\d\/])/g;
// Sets within a set, numbered with letters on both sides of the "/": "GG01/GG70" is card 1 of
// Crown Zenith's Galarian Gallery. Tiny letters are often misread as digits ("6Go1/6670"), so
// these numbers are recognised by their set size after the "/", which is always one of these.
// digits: how many digits the number is padded to ("GG01"), or 0 when it isn't ("SV1").
const LETTERED_SETS = [
	{ letters: "GG", total: "70", digits: 2 },    // Crown Zenith Galarian Gallery
	{ letters: "TG", total: "30", digits: 2 },    // Trainer Gallery, Brilliant Stars to Silver Tempest
	{ letters: "SV", total: "122", digits: 3 },   // Shining Fates Shiny Vault
	{ letters: "SV", total: "94", digits: 0 },    // Hidden Fates Shiny Vault
	{ letters: "RC", total: "32", digits: 0 },    // Generations Radiant Collection
	{ letters: "RC", total: "25", digits: 0 },    // Legendary Treasures Radiant Collection
	{ letters: "H", total: "32", digits: 0 },     // Aquapolis and Skyridge holos
];
// What those tiny capital letters are misread as.
const LETTER_LOOKALIKES = { G: "G6Cc", T: "T71I", S: "S5s$", V: "VvY", R: "Rr", C: "CcG(", H: "H" };

let ocrWorkerPromise = null;
// Whoever is reading a photo right now gets Tesseract's progress reports.
let reportProgress = () => {};

// Reads a photo. onProgress(stage, fraction) is told "starting" first, "loading" while the
// reader downloads (first time only), then "reading" with a fraction from 0 to 1.
// Returns { name, nameSure, number, numberGuesses, setCode, photo, textArea, cardBox, sparkle }:
// - nameSure means the name is a known Pokémon.
// - number is the likeliest collector number; numberGuesses all possible ones, likeliest first.
// - setCode is the set's code read by the number ("PAF", see set-codes.js), or "".
// - photo is the resized picture. textArea (around the card's text) and cardBox (the card, found
//   by its border or shape, or null - see card-finder.js) are boxes in it, used later to
//   compare the card's looks.
// - sparkle is { grain, reverseHolo } from sparkle.js, or null when that can't be told.
// frame: where the viewer was asked to put the card, as shares of the photo's width and height
// ({ x0, x1, y0, y1 }), when the photo came from the app's own camera; otherwise null.
// look: what lookAtPhoto found, when the app looked at the photo before reading it; otherwise
// the reader looks itself. stillWanted(): false once the reading isn't needed any more (another
// photo came). It then stops between its steps, as the text reader reads one thing at a time and
// the next photo would wait for it; a stopped reading throws an error marked stopped.
// onSureNumber({ numberGuesses, setCode, photo, cardBox, sparkle }): asked as soon as the number
// reads sure, before the name is read (roadmap 2.4). When it answers true, the number settled which
// card it is (see cardByNumberAlone in matcher.js): the name isn't read, and the reading returns
// with settled: true and no name.
async function readCardPhoto(imageFile, onProgress = () => {}, frame = null, { look = null, stillWanted = () => true, onSureNumber = null } = {}) {
	reportProgress = onProgress;
	onProgress("starting", null);
	const seen = look || await lookAtPhoto(imageFile, frame);
	const { original, photo, framed, doubtfulBox } = seen;
	let cardBox = seen.cardBox;
	const worker = await getOcrWorker();
	stopUnlessWanted(stillWanted, original);

	// The number first: where it is printed is known once the card's own edges are found, and it
	// alone often settles which card it is, with the card's picture - in about half the reading
	// time, as reading the name takes as long as the number. Other cuts of the card are read when
	// the first reads don't agree: the card's own box a little changed (NUMBER_RECUTS), then the
	// camera's frame. Tiny print cut out differently often reads differently. (In 34 made-up camera
	// pictures, reading the frame first gave one right number fewer: when two cuts read two numbers
	// once each, the earlier one wins.)
	let placeGuesses = [];
	// A doubtful box (see whereIsTheCard) is the card's when the number reads sure where the box says
	// it is printed: nothing else in a photo reads the same number twice there.
	let checkedByNumber = false;
	const numberBigEnough = (box) => (box.y1 - box.y0) * original.height / photo.height >= MIN_CARD_PIXELS_FOR_NUMBER;
	if (!cardBox && doubtfulBox && numberBigEnough(doubtfulBox)) {
		const recuts = NUMBER_RECUTS.map((recut) => recutBox(doubtfulBox, recut));
		const guesses = await readNumberPlacesOfCard(worker, original, photo, doubtfulBox, recuts, stillWanted);
		if (twoReadsAgree(guesses)) {
			cardBox = { ...doubtfulBox, foundBy: "shape, checked by its number" };
			placeGuesses = guesses;
			checkedByNumber = true;
		}
	}
	const cardInOriginal = cardBox ? scaleBox(cardBox, original.width / photo.width) : null;
	let codeRead = null;   // the set code read early, and the set size it was read for
	if (cardBox && numberBigEnough(cardBox)) {
		// (None when the card's box is the frame: its own edges weren't found.)
		const otherCuts = [];
		if (cardBox !== framed) {
			otherCuts.push(...NUMBER_RECUTS.map((recut) => recutBox(cardBox, recut)));
			if (framed) otherCuts.push(framed);
		}
		if (!checkedByNumber) placeGuesses = await readNumberPlacesOfCard(worker, original, photo, cardBox, otherCuts, stillWanted);
		if (onSureNumber && twoReadsAgree(placeGuesses)) {
			const early = likeliestNumbers(placeGuesses).slice(0, MAX_NUMBER_GUESSES);
			if (mayHaveSetCode(early)) {
				stopUnlessWanted(stillWanted, original);
				codeRead = { size: sizeRead(early), code: await readSetCode(worker, original, cardInOriginal, sizeRead(early)) };
			}
			const sparkle = sparkleOf(photo, cardBox, null);
			stopUnlessWanted(stillWanted, original);
			const setCode = codeRead ? codeRead.code : "";
			if (await onSureNumber({ numberGuesses: early, setCode: setCode, photo: photo, cardBox: cardBox, sparkle: sparkle })) {
				original.close();
				return {
					name: "", nameSure: false, number: early[0], numberGuesses: early, setCode: setCode,
					photo: photo, textArea: null, cardBox: cardBox, sparkle: sparkle, settled: true,
				};
			}
		}
	}

	// When it is clear where the card is, only the card is read - not the table, cloth or
	// toploader around it, whose patterns look like made-up letters.
	const view = cardBox ? cardView(photo, cardBox) : { picture: photo, x0: 0, y0: 0, zoom: 1 };

	const firstRead = await readPage(worker, view.picture, "scattered");
	let name = guessCardName(firstRead.lines, firstRead.textArea);
	// The name's own place on the card, read on its own. A known name found there is the card's
	// name, even when the whole card's read found another one somewhere else on the card.
	if (cardBox) {
		stopUnlessWanted(stillWanted, original);
		const stripName = await readNameStrip(worker, original, cardInOriginal);
		if (stripName) name = stripName;
	}
	// No known Pokémon found: read it a second time, the other way.
	if (!name.sure) {
		stopUnlessWanted(stillWanted, original);
		const secondRead = await readPage(worker, view.picture, "block");
		const secondName = guessCardName(secondRead.lines, secondRead.textArea);
		if (secondName.sure || !name.text) name = secondName;
	}
	// Still nothing: maybe a sparkly foil card, whose glitter looks like hundreds of tiny letters.
	// Read a copy with only the dark ink left. Glitter can still fake a close-enough name
	// ("Seel"), so only an exact Pokémon name counts from this read.
	if (!name.sure) {
		stopUnlessWanted(stillWanted, original);
		const inkRead = await readPage(worker, inkOnly(view.picture), "ink");
		const inkName = guessCardName(inkRead.lines, inkRead.textArea, { maxMistakes: 0 });
		if (inkName.sure) name = inkName;
	}

	stopUnlessWanted(stillWanted, original);
	const numberGuesses = await readCollectorNumbers(worker, original, photo, placeGuesses, firstRead, view);
	// Cards since 2023 print their set's code by the number, which tells sets of the same size
	// apart (see set-codes.js). Their numbers are padded ("057/091"), so the code is only looked
	// for then - or when no number was read at all. Read already for the same set size: not again.
	let setCode = "";
	if (cardBox && mayHaveSetCode(numberGuesses)) {
		const size = sizeRead(numberGuesses);
		if (codeRead && codeRead.size === size) {
			setCode = codeRead.code;
		} else {
			stopUnlessWanted(stillWanted, original);
			setCode = await readSetCode(worker, original, cardInOriginal, size);
		}
	}
	original.close();   // the full-size photo takes a lot of memory; it isn't needed any more
	const textArea = boxInPhoto(firstRead.textArea, view);
	return {
		name: name.text,
		nameSure: name.sure,
		number: numberGuesses[0] || "",
		numberGuesses: numberGuesses,
		setCode: setCode,
		photo: photo,
		textArea: textArea,
		cardBox: cardBox,
		// Does it sparkle outside its picture - a reverse holo? (see sparkle.js)
		sparkle: sparkleOf(photo, cardBox, textArea),
	};
}

// Stops a reading that isn't wanted any more (see readCardPhoto), and lets go of its full-size photo.
function stopUnlessWanted(stillWanted, original) {
	if (stillWanted()) return;
	original.close();
	const error = new Error("The reading was stopped: another photo came.");
	error.stopped = true;
	throw error;
}

// ---------- Where the card is (see card-finder.js for finding it) ----------

// Where the card is in the photo, found before any text is read: in a moment, where reading takes
// 5 to 20 seconds. Returns { original, photo, framed, cardBox, doubtfulBox }: the full-size photo
// (close it when done with it), the smaller copy most of the reading works on, the camera's frame in
// that copy (or null), and the card's box in it, or null - or a box that may be the card's, to be
// checked first (see whereIsTheCard). frame: as for readCardPhoto.
async function lookAtPhoto(imageFile, frame = null) {
	// createImageBitmap also turns sideways phone photos the right way up.
	const original = await createImageBitmap(imageFile);
	const photo = shrinkPhoto(original);
	const framed = frame ? frameBoxIn(photo, frame) : null;
	return { original: original, photo: photo, framed: framed, ...whereIsTheCard(photo, framed) };
}

// { cardBox, doubtfulBox }: the card's box in the photo, found by its yellow border or its shape, or
// the whole photo when it is a scan; in a photo from the app's camera, the white frame's box
// (framed) when nothing is found close to it. When none is found, a box of the card's shape that
// may be it (see MIN_DOUBTFUL_SHAPE_SCORE in card-finder.js), to be checked by the number.
function whereIsTheCard(photo, framed) {
	const yellow = findYellowCard(photo);
	const shape = yellow ? null : findCardByShape(photo);
	const found = yellow || (shape && !shape.doubtful ? shape : null) || wholePhotoCard(photo);
	if (framed) return { cardBox: found && fitsFrame(found, framed) ? found : framed, doubtfulBox: null };
	return { cardBox: found, doubtfulBox: !found && shape ? shape : null };
}

function frameBoxIn(photo, frame) {
	// The white frame (shares of the photo) as a box in the photo.
	return {
		x0: frame.x0 * photo.width,
		x1: frame.x1 * photo.width,
		y0: frame.y0 * photo.height,
		y1: frame.y1 * photo.height,
		foundBy: "camera frame",
	};
}

function fitsFrame(box, frame) {
	// Close to the frame's middle, and about its size (see FRAME_CENTRE_SLACK).
	const frameWidth = frame.x1 - frame.x0;
	const frameHeight = frame.y1 - frame.y0;
	const offX = Math.abs((box.x0 + box.x1) / 2 - (frame.x0 + frame.x1) / 2) / frameWidth;
	const offY = Math.abs((box.y0 + box.y1) / 2 - (frame.y0 + frame.y1) / 2) / frameHeight;
	const size = (box.x1 - box.x0) / frameWidth;
	return offX <= FRAME_CENTRE_SLACK && offY <= FRAME_CENTRE_SLACK
		&& size >= FRAME_SIZE_SLACK.min && size <= FRAME_SIZE_SLACK.max;
}

function cardView(photo, cardBox) {
	// The card cut out of the photo, with a little margin, enlarged to the usual reading size.
	const margin = cardBox.foundBy === "camera frame" ? FRAME_CROP_MARGIN : CARD_CROP_MARGIN;
	const marginX = (cardBox.x1 - cardBox.x0) * margin;
	const marginY = (cardBox.y1 - cardBox.y0) * margin;
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
	// willReadFrequently makes the browser draw with the processor instead of the graphics card.
	// Graphics cards resize pictures a tiny bit differently from PC to PC, and a tiny difference
	// can turn "86/110" into "0/110" - drawn this way, the same photo reads the same everywhere.
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	// "high" blends neighbouring pixels smoothly: a tiny scan enlarged this way still reads.
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(original, 0, 0, canvas.width, canvas.height);
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

async function readNameStrip(worker, original, card) {
	// Reads the strip where the name is printed (card is the card's box in the full-size original),
	// in each of the ways in NAME_STRIP_READS until one finds a known name. Returns what
	// guessCardName returns for it, or null when no way found one.
	const cardWidth = card.x1 - card.x0;
	const cardHeight = card.y1 - card.y0;
	const area = {
		x0: card.x0 + cardWidth * NAME_STRIP.x0,
		x1: card.x0 + cardWidth * NAME_STRIP.x1,
		y0: card.y0 + cardHeight * NAME_STRIP.y0,
		y1: card.y0 + cardHeight * NAME_STRIP.y1,
	};
	const zoom = NAME_STRIP_CARD_WIDTH / cardWidth;
	const closeUp = cropAndZoom(original, area, zoom);
	const smallestName = cardHeight * zoom * NAME_MIN_HEIGHT;
	for (const way of NAME_STRIP_READS) {
		const picture = way.ink ? inkAgainstBackground(closeUp, "soft", way.ink === "light") : closeUp;
		const read = await readPage(worker, picture, way.mode);
		const name = biggestKnownName(read.lines, smallestName);
		if (name) return name;
	}
	return null;
}

function biggestKnownName(lines, smallestName = 0) {
	// In the name strip the name is the biggest text, so of the lines holding a known name, the
	// biggest wins - even a Trainer's name over a Pokémon's: two bits of small print above it,
	// "pa TRAI", are one letter from Patrat. Lines with letters smaller than smallestName (in
	// pixels) aren't the name.
	let best = null;
	for (const line of lines) {
		let name = guessCardName([line], null);
		// On the artwork a name can be read right and still be given a low score ("Wiggly tuff",
		// 0 out of 100). Such faint words count too, when they spell a long name all but exactly:
		// short names are too easily made up from bits of the picture.
		if (!name.sure) {
			const faint = guessCardName([line], null, { maxMistakes: 1, minConfidence: 0 });
			if (faint.sure && lettersOnly(faint.text).length >= LONG_NAME_LETTERS) name = faint;
		}
		if (!name.sure || name.size < smallestName) continue;
		if (!best || name.size > best.size) best = name;
	}
	return best;
}

// Returns { text, sure, size, rank }. "sure" means the text is a known Pokémon, Trainer or Energy
// card's name, read with at most maxMistakes wrong letters (the default allows the usual typos,
// see countMistakes). Words Tesseract gave a lower score than minConfidence are left out.
function guessCardName(lines, textArea, { maxMistakes = Infinity, minConfidence = MIN_NAME_CONFIDENCE } = {}) {
	// The name is the biggest text near the top of the card. Only the top part counts,
	// because further down some cards print their attack names even bigger.
	const zoneBottom = textArea ? textArea.y0 + (textArea.y1 - textArea.y0) * NAME_ZONE_SHARE : Infinity;
	// rank: 2 for a known Pokémon name, which always wins; 1 for a known Trainer or Energy card's
	// name; 0 for other text.
	let best = { text: "", size: 0, sure: false, rank: 0 };
	for (const line of lines) {
		const words = nameWordsOnLine(line, false, minConfidence);
		if (words.length === 0) continue;
		if (Math.min(...words.map((word) => word.top)) > zoneBottom) continue;
		// Tesseract's row height measures the letter size of the whole line. It is steadier
		// than the box around a single word, which can come out far too tall.
		const tallest = Math.max(...words.map((word) => word.height));
		const size = line.rowAttributes ? line.rowAttributes.rowHeight : tallest;

		const pokemon = findPokemonName(words.map((word) => word.text), maxMistakes);
		// A Trainer or Energy card. Their names can hold words that are left out above ("Item
		// Finder", "Pokémon Center"), so the whole line is compared.
		const otherCard = findOtherCardName(nameWordsOnLine(line, true, minConfidence).map((word) => word.text), maxMistakes);
		// Both on one line: the closer match wins, and of two as close, the longer one. "Earthen
		// Vessel" read exactly is that Trainer card, not the Pokémon Archen, two letters from "Earthen".
		const trainerWins = otherCard && pokemon && (otherCard.mistakes < pokemon.mistakes
			|| (otherCard.mistakes === pokemon.mistakes && otherCard.letters > pokemon.letters));
		if (pokemon && !trainerWins) {
			if (best.rank < 2 || size > best.size) best = { text: pokemon.name, size: size, sure: true, rank: 2 };
			continue;
		}
		if (best.rank === 2) continue;
		if (otherCard) {
			if (best.rank < 1 || size > best.size) best = { text: otherCard.name, size: size, sure: true, rank: 1 };
			continue;
		}
		if (best.rank === 1) continue;

		// No known name: remember the biggest confident text, just in case.
		const plainWords = words.filter((word) =>
			word.confidence >= MIN_WORD_CONFIDENCE && word.height >= tallest * NAME_SIZE_RATIO);
		const text = plainWords.map((word) => word.text).join(" ");
		if (lettersOnly(text).length >= 3 && size > best.size) best = { text: text, size: size, sure: false, rank: 0 };
	}
	return best;
}

// The words on a line that could be the card's name. keepAllWords keeps the words that are never
// part of a Pokémon's name (NOT_NAME_WORDS), for Trainer names like "Item Finder". Words with a
// lower score than minConfidence are left out.
function nameWordsOnLine(line, keepAllWords = false, minConfidence = MIN_NAME_CONFIDENCE) {
	const kept = [];
	let evolvesFromWords = 0;   // words still to skip after "from"
	for (const word of line.words || []) {
		const text = cleanWord(withoutGluedLogo(word.text));
		const upper = text.toUpperCase();
		// "Evolves from Galarian Linoone": the words after "from", up to a Pokémon's name, are the
		// Pokémon this one evolves from, not this one.
		if (upper === "FROM") {
			evolvesFromWords = MAX_EVOLVES_FROM_WORDS;
			continue;
		}
		// "fromAron": "from" read stuck to the Pokémon's name.
		if (upper.startsWith("FROM") && matchPokemonName(text.slice(4))) continue;
		if (evolvesFromWords > 0) {
			evolvesFromWords = matchPokemonName(text) ? 0 : evolvesFromWords - 1;
			continue;
		}
		if (!text || word.confidence < minConfidence) continue;
		if (!keepAllWords && NOT_NAME_WORDS.has(upper)) continue;
		kept.push({
			text: text,
			confidence: word.confidence,
			height: word.bbox.y1 - word.bbox.y0,
			top: word.bbox.y0,
		});
	}
	return kept;
}

function withoutGluedLogo(rawWord) {
	// A logo printed right after the name can be read stuck to it: "Incineroar@X" is Incineroar ex.
	const glued = rawWord.match(/^([^\p{L}]*\p{L}{3,})[^\p{L}.'’-]/u);
	return glued ? glued[1] : rawWord;
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
	// against the name list. The closest match on the line wins. Returns { name, mistakes, letters }
	// (letters: how many letters were read), or null.
	let best = null;
	for (let i = 0; i < words.length; i++) {
		const tries = [words[i]];
		if (i + 1 < words.length) tries.push(words[i] + " " + words[i + 1]);
		for (const text of tries) {
			const match = matchPokemonName(text);
			if (!match || match.mistakes > maxMistakes) continue;
			if (!best || match.mistakes < best.mistakes) best = { ...match, letters: lettersOnly(text).length };
		}
	}
	return best;
}

function findOtherCardName(words, maxMistakes = Infinity) {
	// Checks every run of neighbouring words against the Trainer and Energy names. The longest
	// run that matches wins ("Double Colorless Energy" over "Colorless Energy"), then the one with
	// the fewest mistakes. Returns { name, mistakes, letters }, or null.
	let best = null;
	for (let start = 0; start < words.length; start++) {
		const end = Math.min(words.length, start + MAX_NAME_WORDS);
		for (let stop = start + 1; stop <= end; stop++) {
			const match = matchOtherCardName(words.slice(start, stop).join(" "));
			if (!match || match.mistakes > maxMistakes) continue;
			// A short name ("Bill", "Cook") only counts on a line of its own, the way a Trainer's name
			// is printed: the same word in other text isn't the card's name.
			if (match.letters < LONG_NAME_LETTERS && (start > 0 || stop < words.length)) continue;
			if (!best || match.letters > best.letters || (match.letters === best.letters && match.mistakes < best.mistakes)) best = match;
		}
	}
	return best;
}

function matchOtherCardName(text) {
	// Like matchPokemonName, but for Trainer and Energy names: { name, mistakes, letters }, or null.
	// Names cut short don't count here: "Professor" is the start of too many of them.
	const read = lettersOnly(text);
	if (read.length < 3) return null;
	// Short names must be read exactly: with one letter wrong, "Seen" would be the Trainer "Seer".
	const allowed = read.length >= LONG_NAME_LETTERS ? 2 + Math.floor((read.length - LONG_NAME_LETTERS) / LETTERS_PER_EXTRA_TYPO) : 0;
	let best = null;
	let tied = false;
	for (const card of OTHER_CARD_KEYS) {
		const mistakes = read === card.key ? 0 : editDistance(read, card.key, allowed);
		if (mistakes > allowed) continue;
		if (!best || mistakes < best.mistakes) {
			best = { name: card.name, key: card.key, mistakes: mistakes, letters: read.length };
			tied = false;
		} else if (mistakes === best.mistakes && card.key !== best.key) {
			// Names with the very same letters ("Energy Removal", "Energy Removal 2") aren't a tie:
			// the search finds them all by those letters anyway.
			tied = true;
		}
	}
	return best && !tied ? best : null;
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

// The number is tiny print along the card's bottom edge, too small to read in the whole photo, so
// that part is read again, enlarged - cut from the full-size original, which has far more detail.
// First where it is printed on the card (cardBox is the card's box in photo): readNumberPlaces, then
// again from the other cuts of the card, in turn, until two reads agree (see NUMBER_RECUTS). In 34
// made-up camera pictures of real cards, the right number came first in 27, where 1.29.0 - which
// read only the camera's frame again - had 23.
async function readNumberPlacesOfCard(worker, original, photo, cardBox, otherCuts, stillWanted) {
	const toOriginal = original.width / photo.width;
	const guesses = await readNumberPlaces(worker, original, scaleBox(cardBox, toOriginal));
	for (const box of otherCuts) {
		if (twoReadsAgree(guesses)) break;
		stopUnlessWanted(stillWanted, original);
		guesses.push(...await readNumberPlaces(worker, original, scaleBox(box, toOriginal), guesses));
	}
	return guesses;
}

async function readCollectorNumbers(worker, original, photo, placeGuesses, page, view) {
	// Tiny print is often misread, so this returns every number that seems possible, likeliest
	// first: the search tries them in turn, and the card database says which one exists.
	// placeGuesses: what readNumberPlacesOfCard read (none without the card's edges).
	const toOriginal = original.width / photo.width;
	const guesses = [...placeGuesses];
	if (!sawWholeNumber(guesses) && page.textArea) {
		// Without the card's outline, or when the number wasn't where the outline says, the
		// lowest lines of text are read one at a time instead. (page was read from view, the
		// card cut out of the photo, so its lines are moved back to where they are in the photo.)
		await worker.setParameters(READING_MODES.line);
		for (const strip of numberLineBands(page.lines, page.textArea)) {
			const stripInPhoto = boxInPhoto(strip, view);
			const closeUp = cropAndZoom(original, scaleBox(stripInPhoto, toOriginal), NUMBER_ZOOM / toOriginal);
			const result = await worker.recognize(closeUp);
			guesses.push(...oncePerNumber(numberCandidates(result.data.text || "")));
		}
	}
	// Also whatever the first read of the card saw, when it clearly had a "/" in it.
	guesses.push(...oncePerNumber(numberCandidates(page.text).filter((guess) => guess.sawSlash)));
	return likeliestNumbers(guesses).slice(0, MAX_NUMBER_GUESSES);
}

async function readNumberPlaces(worker, original, card, earlier = []) {
	// Reads the windows where the number can be (card is the card's box in the original),
	// in each of the ways in NUMBER_READS. When two reads agree on a number with its "/" - two of
	// these, or one of these and one of the earlier guesses (from another cut of the card) - that
	// is as sure as reading gets, and the remaining ways are skipped to save time.
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
			if (way.ink === "white") closeUp = whiteInkOnly(closeUp);
			else if (way.ink) closeUp = inkAgainstBackground(closeUp, way.ink);
			const result = await worker.recognize(closeUp);
			guesses.push(...oncePerNumber(numberCandidates(result.data.text || "")));
		}
		if (twoReadsAgree([...earlier, ...guesses])) break;
	}
	return guesses;
}

function mayHaveSetCode(numberGuesses) {
	// A card from 2023 on pads its number to three digits on both sides ("057/091"). A Black Star
	// promo's number ("SVP100") already names its set.
	if (numberGuesses.length === 0) return true;
	return /^\d{3}\/\d{3}$/.test(numberGuesses[0]);
}

function sizeRead(numberGuesses) {
	// The set size after the "/" of the likeliest number read, or null.
	const total = numberGuesses.length > 0 ? numberGuesses[0].split("/")[1] : "";
	return total && /^\d+$/.test(total) ? Number(total) : null;
}

async function readSetCode(worker, original, card, size) {
	// Reads the set's code by the number (card is the card's box in the original), in the ways of
	// SET_CODE_READS, until a code is found that fits: one of set-codes.js whose set has the size
	// read after the "/" - a misread code seldom does. Returns it ("PAF"), or "" when none fits.
	const cardWidth = card.x1 - card.x0;
	const cardHeight = card.y1 - card.y0;
	for (const way of SET_CODE_READS) {
		await worker.setParameters(READING_MODES[way.mode]);
		const area = {
			x0: card.x0 + cardWidth * way.place.x0,
			x1: card.x0 + cardWidth * way.place.x1,
			y0: card.y0 + cardHeight * way.place.y0,
			y1: card.y0 + cardHeight * way.place.y1,
		};
		const closeUp = inkAgainstBackground(cropAndZoom(original, area, way.cardWidth / cardWidth), "soft", true);
		const result = await worker.recognize(closeUp);
		for (const code of setCodesIn(result.data.text || "")) {
			const codeSize = SET_CODES[code].size;
			if (size === null || codeSize === null || codeSize === size) return code;
		}
	}
	return "";
}

function setCodesIn(text) {
	// The codes of set-codes.js in a text, in the order read. Tiny capitals are read as look-alike
	// digits, so those are turned back into letters first - but for "30C", the one code with digits.
	// Any three letters in a row count, as the code comes glued to the letters around it: "GPAFEN"
	// (regulation mark, code, language) holds PAF.
	const found = [];
	const plain = text.toUpperCase().replace(/[^A-Z0-9]+/g, " ");
	if (plain.replace(/ /g, "").includes("30C")) found.push("30C");
	const letters = plain.replace(/[0-9]/g, (digit) => CODE_LETTER_LOOKALIKES[digit] || " ");
	for (const word of letters.split(" ")) {
		for (let i = 0; i + 3 <= word.length; i++) {
			const code = word.slice(i, i + 3);
			if (SET_CODES[code] && !found.includes(code)) found.push(code);
		}
	}
	return found;
}

function twoReadsAgree(guesses) {
	// Two reads found the same whole number, "/" and all: as sure as reading gets.
	const agreed = likeliestVotes(guesses)[0];
	return Boolean(agreed && agreed.sawSlash && isWholeNumber(agreed.number) && agreed.votes >= 2);
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
	// Each number once, with how many reads found it. Numbers read with their "/" come first
	// (whole ones before "?/110", which only has the set size), then the ones more reads agreed
	// on, then the ones found earliest.
	const tally = new Map();
	guesses.forEach((guess, order) => {
		if (!tally.has(guess.number)) tally.set(guess.number, { number: guess.number, sawSlash: false, votes: 0, order: order });
		const entry = tally.get(guess.number);
		entry.votes++;
		if (guess.sawSlash) entry.sawSlash = true;
	});
	return [...tally.values()].sort((a, b) =>
		Number(b.sawSlash) - Number(a.sawSlash)
		|| Number(isWholeNumber(b.number)) - Number(isWholeNumber(a.number))
		|| b.votes - a.votes
		|| a.order - b.order);
}

function isWholeNumber(number) {
	// "86/110" is whole; "?/110" lost its own number and only tells the set size.
	return !number.startsWith(UNREAD_NUMBER);
}

function sawWholeNumber(guesses) {
	return guesses.some((guess) => guess.sawSlash && isWholeNumber(guess.number));
}

function scaleBox(box, scale) {
	return { x0: box.x0 * scale, x1: box.x1 * scale, y0: box.y0 * scale, y1: box.y1 * scale };
}

function recutBox(box, recut) {
	// The card's box made recut.scale times as big around its middle, and moved up by recut.up of
	// its height (see NUMBER_RECUTS).
	const width = (box.x1 - box.x0) * recut.scale;
	const height = (box.y1 - box.y0) * recut.scale;
	const centreX = (box.x0 + box.x1) / 2;
	const centreY = (box.y0 + box.y1) / 2 - (box.y1 - box.y0) * recut.up;
	return { x0: centreX - width / 2, x1: centreX + width / 2, y0: centreY - height / 2, y1: centreY + height / 2 };
}

// A copy of a close-up with only the black printed ink left, for reading small print on a
// coloured card. Black ink is dark in all three colours (red, green, blue), while every card
// background - red, purple, green, yellow, even foil glitter - is bright in at least one. So
// each pixel is judged by its brightest colour, compared with the average around it, which
// also evens out shadows and glare. style "soft" keeps shades of grey at the edges of the
// letters; "hard" is pure black and white. lightInk finds white letters instead (printed on the
// artwork of many full-art cards): they are light in all three colours, so each pixel is judged
// by its darkest colour, turned around - and they come out black, as Tesseract likes them.
function inkAgainstBackground(picture, style, lightInk = false) {
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
		const red = pixels[i * 4];
		const green = pixels[i * 4 + 1];
		const blue = pixels[i * 4 + 2];
		brightest[i] = lightInk ? 255 - Math.min(red, green, blue) : Math.max(red, green, blue);
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

// A copy of a close-up with only its near-white print left, in black on white, as Tesseract likes it:
// for the white numbers of full-art and dark cards. White print is light in all three colours, so
// each pixel is judged by its darkest colour, against the whitest print in the close-up - which
// also allows for dim photos, where white is grey.
function whiteInkOnly(picture) {
	const copy = document.createElement("canvas");
	copy.width = picture.width;
	copy.height = picture.height;
	const ctx = copy.getContext("2d", { willReadFrequently: true });
	ctx.drawImage(picture, 0, 0);
	const image = ctx.getImageData(0, 0, copy.width, copy.height);
	const pixels = image.data;
	const darkest = new Uint8Array(pixels.length / 4);
	for (let i = 0; i < darkest.length; i++) darkest[i] = Math.min(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
	const sorted = Uint8Array.from(darkest).sort();
	const whitest = sorted[Math.floor(sorted.length * (1 - WHITEST_SKIPPED))];
	for (let i = 0; i < darkest.length; i++) {
		const value = darkest[i] >= whitest * WHITE_INK_SHARE ? 0 : 255;
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
	// A dot or comma can stick to it too, on italic print: "239/.091".
	cleaned = cleaned.replace(/(?<=\d)\s*[.,]?\s*\/\s*[.,]?\s*(?=\d)/g, "/");
	const found = [];
	// "GG01/GG70", "TG05/TG30", "SV1/SV94" first: their letters would otherwise be taken for
	// digits, or cut off ("G05/TG30"). Each one found is blanked out, so it counts once.
	for (const set of LETTERED_SETS) {
		cleaned = cleaned.replace(letteredNumberPattern(set), (whole, before) => {
			const number = letteredNumber(before, set);
			if (number) found.push({ number: set.letters + number + "/" + set.letters + set.total, sawSlash: true });
			return " ";
		});
	}
	cleaned = fixDigitLookalikes(cleaned);
	// Numbers printed near the collector number that are never it: Pokédex numbers ("#157",
	// "No. 157"), levels ("LV. 57") and years ("©1995-2000").
	cleaned = cleaned
		.replace(/(#|No\.?\s*|LV\.?\s*)\d+/gi, " ")
		.replace(/(?<!\d)(19|20)\d\d(?!\d)/g, " ");

	// "4/102", "006/198". Tiny print can turn the "/" into "|" or "\".
	for (const match of cleaned.matchAll(/([A-Z]{0,3}\d{1,3})\s*[\/|\\]\s*([A-Z]{0,3}\d{2,3})(?!\d)/g)) {
		if (Number(match[2]) > MAX_SET_SIZE) continue;   // plain digits only; "RT30" gives NaN
		// No card is number 0, so "0/110" is a misread number - but the set size after the "/"
		// is still worth keeping: the search can compare the photo with every card of that size.
		const number = /^0+$/.test(match[1]) ? UNREAD_NUMBER : match[1];
		found.push({ number: number + "/" + match[2], sawSlash: true });
	}
	// A Black Star promo's code: "SWSH193". It is as sure a sign of the number as a "/".
	for (const match of cleaned.matchAll(PROMO_NUMBER)) {
		// No promo has four digits: "SWSH0001" is SWSH001 with a misread zero too many.
		const digits = match[2].length === 4 ? match[2].slice(1) : match[2];
		found.push({ number: match[1].toUpperCase() + digits, sawSlash: true });
	}
	for (const match of cleaned.matchAll(OLD_CODE_NUMBER)) {
		found.push({ number: match[1] + match[2], sawSlash: true });
	}
	for (const match of cleaned.matchAll(SVP_NUMBER)) {
		found.push({ number: "SVP" + match[1], sawSlash: true });
	}
	// The "/" can also vanish altogether ("4102") or turn into a digit ("107130", "2397091").
	for (const digits of cleaned.match(/(?<!\d)\d{4,7}(?!\d)/g) || []) {
		for (const number of splitNumberAndTotal(digits)) found.push({ number: number, sawSlash: false });
	}
	return found;
}

function letteredNumberPattern(set) {
	// "6Go1/6670" for GG70: whatever was read before the "/", then the set's letters (or their
	// lookalikes) and its size. After the size may come the rarity symbol, read as one more
	// character ("RC1/RC320").
	const letters = set.letters.split("").map((letter) => "[" + LETTER_LOOKALIKES[letter] + "]").join("");
	return new RegExp("([A-Za-z0-9!$]{1,6})\\s?[\\/|\\\\]\\s?" + letters + "\\s?" + set.total + "[0-9@®©*]?(?![0-9])", "g");
}

function letteredNumber(before, set) {
	// The number is the end of what was read before the "/", digits and digit lookalikes: "6Go1"
	// is 01 of GG01, "RCS" is 5 of RC5. Returns "" when that doesn't make a number of this set.
	const most = set.digits || 2;
	let digits = "";
	for (let i = before.length - 1; i >= 0 && digits.length < most; i--) {
		const character = before[i];
		const digit = /\d/.test(character) ? character : DIGIT_LOOKALIKES[character];
		if (!digit) break;
		// Before a number that isn't padded may come the set's own letters: the "S" of "SV1" is no 5.
		if (set.digits === 0 && set.letters.includes(character.toUpperCase())) break;
		digits = digit + digits;
	}
	if (set.digits > 0 && digits.length !== set.digits) return "";
	if (digits === "" || Number(digits) === 0 || Number(digits) > Number(set.total)) return "";
	return digits;
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
	// The same with its "/" read as a 7 or a 1, as happens on italic white print: "2397091" is
	// "239/091". The padding shows which half is which, even when the number is bigger than the
	// set's size (a secret rare), which the splits below would not allow.
	if (digits.length === 7 && (digits[3] === "7" || digits[3] === "1")) return [digits.slice(0, 3) + "/" + digits.slice(4)];
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
	const ctx = result.getContext("2d", { willReadFrequently: true });   // same on every PC (see shrinkPhoto)
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(picture, x0, y0, x1 - x0, y1 - y0, 0, 0, result.width, result.height);
	return result;
}
