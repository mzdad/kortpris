"use strict";

// The code each set since Scarlet & Violet (2023) prints in the card's bottom-left corner, before
// its number: "PAF EN 057/091" is card 57 of Paldean Fates. The reader (reader.js) looks for these
// codes, and the picture match (matcher.js) uses a code read to pick among cards that look alike -
// Black Bolt, White Flare and Chaos Rising even have the same number of cards, 86.
//
// sets: the TCGdex sets the code can be. size: the set's size printed after the "/", so a code can
// be checked against the number read ("PAF" with "…/091"); null where it can't (promos print no
// size, and the Classic Collection prints its originals' numbers). From TCGdex's sets
// ("abbreviation"), September 2026: add a new set's code here when it comes out. Older cards print
// a symbol instead of a code. A code that isn't in this list is ignored.
const SET_CODES = {
	SVP: { sets: ["svp"], size: null },         // Scarlet & Violet Black Star promos
	SVE: { sets: ["sve"], size: 24 },           // Scarlet & Violet Energy
	SVI: { sets: ["sv01"], size: 198 },         // Scarlet & Violet
	PAL: { sets: ["sv02"], size: 193 },         // Paldea Evolved
	OBF: { sets: ["sv03"], size: 197 },         // Obsidian Flames
	MEW: { sets: ["sv03.5"], size: 165 },       // 151
	MFB: { sets: ["mfb"], size: 48 },           // My First Battle
	PAR: { sets: ["sv04"], size: 182 },         // Paradox Rift
	PAF: { sets: ["sv04.5"], size: 91 },        // Paldean Fates
	TEF: { sets: ["sv05"], size: 162 },         // Temporal Forces
	TWM: { sets: ["sv06"], size: 167 },         // Twilight Masquerade
	SFA: { sets: ["sv06.5"], size: 64 },        // Shrouded Fable
	SCR: { sets: ["sv07"], size: 142 },         // Stellar Crown
	SSP: { sets: ["sv08"], size: 191 },         // Surging Sparks
	PRE: { sets: ["sv08.5"], size: 131 },       // Prismatic Evolutions
	JTG: { sets: ["sv09"], size: 159 },         // Journey Together
	DRI: { sets: ["sv10"], size: 182 },         // Destined Rivals
	BLK: { sets: ["sv10.5b"], size: 86 },       // Black Bolt
	WHT: { sets: ["sv10.5w"], size: 86 },       // White Flare
	MEE: { sets: ["mee"], size: 16 },           // Mega Evolution Energy
	MEG: { sets: ["me01"], size: 132 },         // Mega Evolution
	MEP: { sets: ["mep"], size: null },         // Mega Evolution Black Star promos
	PFL: { sets: ["me02"], size: 94 },          // Phantasmal Flames
	ASC: { sets: ["me02.5"], size: 217 },       // Ascended Heroes
	POR: { sets: ["me03"], size: 88 },          // Perfect Order
	CRI: { sets: ["me04"], size: 86 },          // Chaos Rising
	PBL: { sets: ["me05"], size: 84 },          // Pitch Black
	"30C": { sets: ["30th", "30th-c"], size: null },   // 30th Celebration, and its Classic Collection
};

// The TCGdex sets a code read can be, or none for "" or a code not in the list.
function setsOfCode(code) {
	return code && SET_CODES[code] ? SET_CODES[code].sets : [];
}
