"use strict";

// Tells from the photo whether a card is a reverse holo: foil that sparkles everywhere except
// its picture. That print can be worth a hundred times the plain one (Legendary Collection
// Dratini: about 4 kr. plain, over 300 kr. as a reverse holo), so the right price depends on it.
//
// How: below the picture, a plain card's background is smooth colour, while a reverse holo's is
// full of tiny glittering dots. So the fine grain of that background is measured - after
// cutting out the letters and symbols, which are just as sharp but dark.

// The card is looked at this wide, in pixels.
const SPARKLE_CARD_WIDTH = 700;
// Where the background is measured: the card below its picture (shares of the card's box)...
const SPARKLE_AREA = { x0: 0.06, x1: 0.94, y0: 0.50, y1: 0.93 };
// ...or, when the card's outline wasn't found, this lower share of the text found on it.
const SPARKLE_TEXT_SHARE = 0.45;
// A text area is about this share of the card's width (for the size it is looked at).
const TEXT_AREA_WIDTH_SHARE = 0.85;
// Grain: how far each pixel is from the average of the pixels up to this far away.
const GRAIN_RADIUS = 2;
// Letters and symbols: pixels this much darker than the area around them (this far out) are
// left out, and so are the pixels up to INK_MARGIN away from them.
const INK_SURROUND_RADIUS = 12;
const INK_DARKNESS = 0.72;
const INK_MARGIN = 3;
// Blurring the letters' outline spreads them out; a pixel with this much of a letter blurred
// into it counts as near one.
const NEAR_INK = 0.02;
// The middle grain of the background from here up means reverse holo. On 29 real photos
// (version 1.22.0), the reverse holos measured 7.3 and 7.7 and every other card 1.7 to 3.4.
const REVERSE_HOLO_GRAIN = 5;
// With less background than this share left, there is too little to judge.
const MIN_BACKGROUND_SHARE = 0.15;

// Returns { grain, reverseHolo }, or null when it can't tell. cardBox and textArea are boxes in
// the photo; either may be null.
function sparkleOf(photo, cardBox, textArea) {
	const area = sparkleArea(cardBox, textArea);
	if (!area) return null;
	const zoom = SPARKLE_CARD_WIDTH / area.cardWidth;
	const picture = cropAndZoom(photo, area, zoom);
	const width = picture.width;
	const height = picture.height;
	const pixels = picture.getContext("2d").getImageData(0, 0, width, height).data;
	const brightness = new Float32Array(width * height);
	for (let i = 0; i < brightness.length; i++) {
		brightness[i] = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
	}
	const nearby = smoothBlur(brightness, width, height, GRAIN_RADIUS);
	const surroundings = smoothBlur(brightness, width, height, INK_SURROUND_RADIUS);

	// Where the letters and symbols are, and a little around them.
	const ink = new Float32Array(brightness.length);
	for (let i = 0; i < ink.length; i++) {
		if (brightness[i] < surroundings[i] * INK_DARKNESS) ink[i] = 1;
	}
	const nearInk = smoothBlur(ink, width, height, INK_MARGIN);

	const grain = [];
	for (let i = 0; i < brightness.length; i++) {
		if (nearInk[i] < NEAR_INK) grain.push(Math.abs(brightness[i] - nearby[i]));
	}
	if (grain.length < brightness.length * MIN_BACKGROUND_SHARE) return null;
	grain.sort((a, b) => a - b);
	const middle = grain[Math.floor(grain.length / 2)];
	return { grain: middle, reverseHolo: middle >= REVERSE_HOLO_GRAIN };
}

function sparkleArea(cardBox, textArea) {
	// The part of the photo to measure, plus how wide the card is there.
	if (cardBox) {
		const width = cardBox.x1 - cardBox.x0;
		const height = cardBox.y1 - cardBox.y0;
		return {
			x0: cardBox.x0 + width * SPARKLE_AREA.x0,
			x1: cardBox.x0 + width * SPARKLE_AREA.x1,
			y0: cardBox.y0 + height * SPARKLE_AREA.y0,
			y1: cardBox.y0 + height * SPARKLE_AREA.y1,
			cardWidth: width,
		};
	}
	if (textArea) {
		const height = textArea.y1 - textArea.y0;
		return {
			x0: textArea.x0,
			x1: textArea.x1,
			y0: textArea.y1 - height * SPARKLE_TEXT_SHARE,
			y1: textArea.y1,
			cardWidth: (textArea.x1 - textArea.x0) / TEXT_AREA_WIDTH_SHARE,
		};
	}
	return null;
}

// True when this card was printed as a reverse holo, going by the price database. TCGplayer's
// list of prints is trusted first: Cardmarket gives some cards from before reverse holos existed
// a "reverse holo" price anyway (Base Set 2 Dratini, 2000: €0.29, below its normal price).
function hasReverseHolo(card) {
	const tcgplayer = (card.tcgplayer && card.tcgplayer.prices) || {};
	if (Object.keys(tcgplayer).length > 0) return Boolean(tcgplayer.reverseHolofoil);
	const cardmarket = (card.cardmarket && card.cardmarket.prices) || {};
	return cardmarket.reverseHoloAvg30 > 0 || cardmarket.reverseHoloTrend > 0 || cardmarket.reverseHoloSell > 0;
}
