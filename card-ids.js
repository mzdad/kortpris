"use strict";

// How cards were known in pokemontcg.io, the card database the app used until version 1.32.0, and
// how TCGdex knows them. Saved and learned cards keep their old ids until they are translated
// (see currentCardIds in cards.js), and cards TCGdex has no picture of borrow Scrydex's, which knows
// cards by the old ids (see scrydexIdOf below).
// Made on 27 September 2026 by matching the two databases' set lists by name and code.

// Every set the old database had: its id there, and TCGdex's (the same for most).
const OLD_SET_IDS = {
	"base1": "base1", "base2": "base2", "base3": "base3", "base4": "base4",
	"base5": "base5", "base6": "lc", "basep": "basep", "bp": "bog",
	"bw1": "bw1", "bw10": "bw10", "bw11": "bw11", "bw2": "bw2",
	"bw3": "bw3", "bw4": "bw4", "bw5": "bw5", "bw6": "bw6",
	"bw7": "bw7", "bw8": "bw8", "bw9": "bw9", "bwp": "bwp",
	"cel25": "cel25", "cel25c": "cel25cc", "col1": "col1", "dc1": "dc1",
	"det1": "det1", "dp1": "dp1", "dp2": "dp2", "dp3": "dp3",
	"dp4": "dp4", "dp5": "dp5", "dp6": "dp6", "dp7": "dp7",
	"dpp": "dpp", "dv1": "dv1", "ecard1": "ecard1", "ecard2": "ecard2",
	"ecard3": "ecard3", "ex1": "ex1", "ex10": "ex10", "ex11": "ex11",
	"ex12": "ex12", "ex13": "ex13", "ex14": "ex14", "ex15": "ex15",
	"ex16": "ex16", "ex2": "ex2", "ex3": "ex3", "ex4": "ex4",
	"ex5": "ex5", "ex6": "ex6", "ex7": "ex7", "ex8": "ex8",
	"ex9": "ex9", "fut20": "fut2020", "g1": "g1", "gym1": "gym1",
	"gym2": "gym2", "hgss1": "hgss1", "hgss2": "hgss2", "hgss3": "hgss3",
	"hgss4": "hgss4", "hsp": "hgssp", "mcd11": "2011bw", "mcd12": "2012bw",
	"mcd14": "2014xy", "mcd15": "2015xy", "mcd16": "2016xy", "mcd17": "2017sm",
	"mcd18": "2018sm", "mcd19": "2019sm", "mcd21": "2021swsh", "mcd22": "2022swsh",
	"me1": "me01", "me2": "me02", "me2pt5": "me02.5", "me3": "me03",
	"me4": "me04", "me5": "me05", "me55": "30th", "neo1": "neo1",
	"neo2": "neo2", "neo3": "neo3", "neo4": "neo4", "np": "np",
	"pgo": "swsh10.5", "pl1": "pl1", "pl2": "pl2", "pl3": "pl3",
	"pl4": "pl4", "pop1": "pop1", "pop2": "pop2", "pop3": "pop3",
	"pop4": "pop4", "pop5": "pop5", "pop6": "pop6", "pop7": "pop7",
	"pop8": "pop8", "pop9": "pop9", "rsv10pt5": "sv10.5w", "ru1": "ru1",
	"si1": "si1", "sm1": "sm1", "sm10": "sm10", "sm11": "sm11",
	"sm115": "sm115", "sm12": "sm12", "sm2": "sm2", "sm3": "sm3",
	"sm35": "sm3.5", "sm4": "sm4", "sm5": "sm5", "sm6": "sm6",
	"sm7": "sm7", "sm75": "sm7.5", "sm8": "sm8", "sm9": "sm9",
	"sma": "sma", "smp": "smp", "sv1": "sv01", "sv10": "sv10",
	"sv2": "sv02", "sv3": "sv03", "sv3pt5": "sv03.5", "sv4": "sv04",
	"sv4pt5": "sv04.5", "sv5": "sv05", "sv6": "sv06", "sv6pt5": "sv06.5",
	"sv7": "sv07", "sv8": "sv08", "sv8pt5": "sv08.5", "sv9": "sv09",
	"sve": "sve", "svp": "svp", "swsh1": "swsh1", "swsh10": "swsh10",
	"swsh10tg": "swsh10tg", "swsh11": "swsh11", "swsh11tg": "swsh11tg", "swsh12": "swsh12",
	"swsh12pt5": "swsh12.5", "swsh12pt5gg": "swsh12.5gg", "swsh12tg": "swsh12tg", "swsh2": "swsh2",
	"swsh3": "swsh3", "swsh35": "swsh3.5", "swsh4": "swsh4", "swsh45": "swsh4.5",
	"swsh45sv": "swsh4.5sv", "swsh5": "swsh5", "swsh6": "swsh6", "swsh7": "swsh7",
	"swsh8": "swsh8", "swsh9": "swsh9", "swsh9tg": "swsh9tg", "swshp": "swshp",
	"tk1a": "tk-ex-latia", "tk1b": "tk-ex-latio", "tk2a": "tk-ex-p", "tk2b": "tk-ex-m",
	"xy0": "xy0", "xy1": "xy1", "xy10": "xy10", "xy11": "xy11",
	"xy12": "xy12", "xy2": "xy2", "xy3": "xy3", "xy4": "xy4",
	"xy5": "xy5", "xy6": "xy6", "xy7": "xy7", "xy8": "xy8",
	"xy9": "xy9", "xyp": "xyp", "zsv10pt5": "sv10.5b",
};
// ...and the other way round: TCGdex's set id, and the old database's.
const OLD_SET_OF = Object.fromEntries(Object.entries(OLD_SET_IDS).map(([oldId, id]) => [id, oldId]));

// The 30th Celebration: Classic Collection (2026) reprints each carry their original's number, like
// "69/132" on Erika's Jigglypuff. TCGdex numbers them 1 to 30 instead (set "30th-c"), in the order
// of those numbers; pokemontcg.io used the original's number (set "me55c", with a letter when two
// share one). TCGdex's number: [the old number, the name as pokemontcg.io spelled it].
const REPRINT_SET = "30th-c";
const OLD_REPRINT_SET = "me55c";
const REPRINT_NUMBERS = {
	"001": ["4", "Charizard"], "002": ["5", "Delcatty"],
	"003": ["11", "Metagross"], "004": ["11g", "Genesect-EX"],
	"005": ["18", "Misty"], "006": ["19", "Dark Tyranitar"],
	"007": ["25", "Sneasel"], "008": ["33", "Pikachu & Zekrom-GX"],
	"009": ["41", "Greninja BREAK"], "010": ["43", "Uxie"],
	"011": ["47", "Crobat G"], "012": ["50", "Raikou"],
	"013": ["57", "Buzzwole-GX"], "014": ["58", "Pikachu"],
	"015": ["69", "Erika's Jigglypuff"], "016": ["85", "Rayquaza-EX"],
	"017": ["89", "Solgaleo-GX"], "018": ["94", "Gengar"],
	"019": ["99", "Darkrai & Cresselia LEGEND"], "020": ["100", "Darkrai & Cresselia LEGEND"],
	"021": ["101", "N"], "022": ["106p", "Palkia LV.X"],
	"023": ["106m", "M Gardevoir-EX"], "024": ["106", "Shining Celebi"],
	"025": ["108", "Scizor ex"], "026": ["114", "Mew VMAX"],
	"027": ["123", "Arceus VSTAR"], "028": ["138", "Zacian V"],
	"029": ["149", "Lugia"], "030": ["203", "Magikarp"],
};

// Cards TCGdex has no picture of (about 1,600 in September 2026: gallery, promo, trainer kit and
// McDonald's cards, and the newest promos) borrow Scrydex's, from the makers of the old database: it
// knows cards by the old database's ids, and has sets the old database never had. Checked on 27
// September 2026 against Scrydex's own set lists: 1,552 of TCGdex's 1,621 such cards (all but the
// Unown Collection, My First Battle, Yellow A Alternate and one Terapagos promo). Scrydex answers
// a card it hasn't with a picture of a card's back, so the ids must be right.
// Sets Scrydex has and the old database hadn't: TCGdex's set id, and Scrydex's.
const SCRYDEX_ONLY_SET_IDS = {
	"mep": "mep", "mee": "mee", "2023sv": "mcd23", "2024sv": "mcd24", "ex5.5": "wb1", "miscp": "miscp",
	"tk-dp-m": "tk3a", "tk-dp-l": "tk3b", "tk-hs-r": "tk4a", "tk-hs-g": "tk4b",
	"tk-bw-z": "tk5a", "tk-bw-e": "tk5b", "tk-xy-sy": "tk6a", "tk-xy-n": "tk6b",
	"tk-xy-w": "tk7a", "tk-xy-b": "tk7b", "tk-xy-latio": "tk8a", "tk-xy-latia": "tk8b",
	"tk-xy-su": "tk9a", "tk-xy-p": "tk9b", "tk-sm-l": "tk10a", "tk-sm-r": "tk10b",
};
// Cards Scrydex numbers differently: TCGdex's id, and Scrydex's (null: Scrydex hasn't it). The
// Celebrations Classic Collection (2021) reprints carry their original's number there, like the
// 30th Celebration's.
const SCRYDEX_CARD_IDS = {
	"cel25cc-CC001": "cel25c-2_A", "cel25cc-CC002": "cel25c-4_A", "cel25cc-CC003": "cel25c-15_A1",
	"cel25cc-CC004": "cel25c-73_A", "cel25cc-CC005": "cel25c-8_A", "cel25cc-CC006": "cel25c-15_A2",
	"cel25cc-CC007": "cel25c-15_A3", "cel25cc-CC008": "cel25c-24_A", "cel25cc-CC009": "cel25c-20_A",
	"cel25cc-CC010": "cel25c-66_A", "cel25cc-CC011": "cel25c-9_A", "cel25cc-CC012": "cel25c-86_A",
	"cel25cc-CC013": "cel25c-88_A", "cel25cc-CC014": "cel25c-93_A", "cel25cc-CC015": "cel25c-17_A",
	"cel25cc-CC016": "cel25c-15_A4", "cel25cc-CC017": "cel25c-109_A", "cel25cc-CC018": "cel25c-145_A",
	"cel25cc-CC019": "cel25c-107_A", "cel25cc-CC020": "cel25c-113_A", "cel25cc-CC021": "cel25c-114_A",
	"cel25cc-CC022": "cel25c-54_A", "cel25cc-CC023": "cel25c-97_A", "cel25cc-CC024": "cel25c-76_A",
	"cel25cc-CC025": "cel25c-60_A",
	"bwp-BW04": "bwp-BW004", "bwp-BW05": "bwp-BW005",
	"mep-Museum": "mep-1000",
	"svp-500": null,
};

// Scrydex's id for a card TCGdex knows as setId + "-" + localId, or null when Scrydex hasn't it.
function scrydexIdOf(setId, localId) {
	const cardId = setId + "-" + localId;
	if (cardId in SCRYDEX_CARD_IDS) return SCRYDEX_CARD_IDS[cardId];
	if (setId === REPRINT_SET) {
		const old = REPRINT_NUMBERS[localId];
		return old ? OLD_REPRINT_SET + "-" + old[0] : null;
	}
	const scrydexSet = OLD_SET_OF[setId] || SCRYDEX_ONLY_SET_IDS[setId];
	if (!scrydexSet) return null;
	let number = localId;
	if (/^\d+$/.test(number)) {
		number = String(Number(number));   // "085" is "85" there
	} else if (scrydexSet === "ecard2" || scrydexSet === "ecard3") {
		// The e-Card holos: "H01" is "H1" there. Aquapolis's two prints of a card, "50a" and "50b",
		// are one card, "50".
		number = number.replace(/^H0/, "H").replace(/^(\d+)[ab]$/, "$1");
	}
	return scrydexSet + "-" + number;
}
