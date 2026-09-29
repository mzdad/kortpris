"use strict";

// Japanese Pokémon cards (roadmap 6.1): found and priced in TCGdex's Japanese database, which is shaped
// like the English one (a card has a number, a set, a picture, Cardmarket's prices) but is asked another
// way: TCGdex's fast search (GraphQL, cards.js) only knows English cards, so Japanese cards are found
// with its plain list search - ?dexId=eq:25 (every Pikachu), ?localId=eq:151|0151 (every card numbered
// 151), ?id=eq:SV2a-151, ?name=ピカチュウ - which answers { id, localId, name, image } for each card. Its
// set comes from the id ("SV2a-151" is card 151 of "SV2a"), and everything else (prices, rarity, kind)
// from the card's own page, when its page is opened (see withJapanesePrices).
//
// Everything after that works as it does for English cards, as these are made into the same kind of
// card (see japaneseCard). A Japanese card's id starts with JAPANESE_ID_START, so it can't be mixed up
// with an English card of the same TCGdex id, and saved cards say which they are (see isJapaneseId in
// cards.js, which the pages that only have cards.js need too).
//
// A Japanese card is named in Japanese ("ピカチュウ"). Its English name comes from its Pokédex number
// (dexId): POKEMON_NAMES in pokemon-names.js is in that order. Trainer and Energy cards have no Pokédex
// number, and are named in Japanese only.

const TCGDEX_JA_API = "https://api.tcgdex.net/v2/ja";
// Japanese letters: kana, kanji, and the wide forms of Latin letters and digits.
const JAPANESE_LETTERS = /[぀-ヿ㐀-鿿＀-￯]/;
// At most this many cards are asked for by their ids in one question.
const JAPANESE_IDS_PER_QUESTION = 100;

let japaneseSetsPromise = null;                // every set (names and sizes), asked once per visit, kept a day
const japanesePricesAsked = new Map();         // card id -> its page (a promise), asked once per visit

// ---------- The sets ----------

// Every Japanese set: { byId: Map("SV2a" -> set), byCode: Map("SV2A" -> set) }, a set being
// { id, name, printedTotal, releaseDate }. printedTotal is the size printed after the "/" on the cards
// (TCGdex's "official" count; null for promos, which print none). releaseDate comes from
// japanese-sets.js, "" for a set that came out after it was made.
function japaneseSets() {
	if (!japaneseSetsPromise) {
		japaneseSetsPromise = askTcgdex(TCGDEX_JA_API + "/sets").then((list) => {
			const byId = new Map();
			const byCode = new Map();
			for (const raw of list) {
				const set = {
					id: raw.id,
					name: raw.name,
					printedTotal: (raw.cardCount && raw.cardCount.official) || null,
					releaseDate: (JAPANESE_SETS[raw.id] || [])[0] || "",
				};
				byId.set(set.id, set);
				byCode.set(set.id.toUpperCase(), set);
			}
			if (byId.size === 0) throw new Error("TCGdex sent no Japanese sets");
			return { byId: byId, byCode: byCode };
		});
		japaneseSetsPromise.catch(() => { japaneseSetsPromise = null; });   // asked again at the next search
	}
	return japaneseSetsPromise;
}

// ---------- Finding cards ----------

// Searches for Japanese cards by name and the number in the bottom corner, as findCards in cards.js does
// for English ones, and returns the same: { cards, description, totalCount, exactFound }. The name may be
// a Pokémon's English name ("Pikachu") or its Japanese one; the number "151/165", "SV2a 151/165" or just
// "151" - a promo prints its set's code after the number, "001/SV-P". Tries the most exact search first:
// the first that finds anything wins. Throws when the database doesn't answer.
async function findJapaneseCards(name, numberText) {
	const sets = await japaneseSets();
	const parsed = parseJapaneseNumber(numberText, sets);
	const who = whoIsJapaneseName(name);
	// Everything needed is asked at once: the cards with the name, and the ones with the number.
	const [byName, byNumber] = await Promise.all([
		who.dexIds.length > 0 ? japaneseCardsWhere("dexId=eq:" + who.dexIds.join("|"), sets, who.english)
			: who.japanese ? japaneseCardsWhere("name=" + encodeURIComponent(who.japanese), sets, "") : [],
		parsed.number ? japaneseCardsNumbered(parsed, sets) : [],
	]);
	const shown = shownJapaneseNumber(parsed);
	const nameShown = who.typed;
	const attempts = [];
	if (nameShown && parsed.number && parsed.total) {
		attempts.push({ cards: withJapaneseNumber(byName, parsed, true), description: { key: "matchExact", values: { name: nameShown, number: shown } }, exact: true });
	}
	if (nameShown && parsed.number) {
		attempts.push({ cards: withJapaneseNumber(byName, parsed, false), description: { key: "matchAnySet", values: { name: nameShown, number: shown } } });
	}
	if (parsed.number && (parsed.total || parsed.setId)) {
		attempts.push({
			cards: withJapaneseNumber(byNumber, parsed, true),
			description: nameShown ? { key: "matchNumberNameMissed", values: { name: nameShown, number: shown } } : { key: "matchNumberOnly", values: { number: shown } },
		});
	}
	if (nameShown) {
		attempts.push({ cards: byName, description: { key: "matchNameOnly", values: { name: nameShown } } });
	}
	if (parsed.number) {
		attempts.push({ cards: withJapaneseNumber(byNumber, parsed, false), description: { key: "matchNumberNoTotal", values: { number: shown } } });
	}
	for (const attempt of attempts) {
		if (attempt.cards.length > 0) {
			return {
				cards: attempt.cards.slice(0, RESULTS_PAGE_SIZE),
				description: attempt.description,
				totalCount: attempt.cards.length,
				exactFound: Boolean(attempt.exact),
				setSizes: [],
				numbersRead: [],
			};
		}
	}
	return { cards: [], description: null, totalCount: 0, exactFound: false, setSizes: [], numbersRead: [] };
}

// The cards with these ids ("ja:SV2a-151"), fresh from the database, in the same order. An id the
// database doesn't have is left out.
async function findJapaneseCardsById(ids) {
	const sets = await japaneseSets();
	const rawIds = ids.map((id) => id.slice(JAPANESE_ID_START.length));
	const cards = [];
	for (let start = 0; start < rawIds.length; start += JAPANESE_IDS_PER_QUESTION) {
		const some = rawIds.slice(start, start + JAPANESE_IDS_PER_QUESTION);
		// Two ids at least: asked for one alone, TCGdex finds nothing (see cardsNumbered in cards.js).
		cards.push(...await japaneseCardsWhere("id=eq:" + [...some, some[0]].join("|"), sets, ""));
	}
	return ids.map((id) => cards.find((card) => card.id === id)).filter(Boolean);
}

// The cards TCGdex's list search finds with this filter ("dexId=eq:25"), as the app's cards, newest first.
// english: the English name to put before their Japanese one, when the filter was a Pokédex number.
async function japaneseCardsWhere(filter, sets, english) {
	const list = await askTcgdex(TCGDEX_JA_API + "/cards?" + filter);
	if (!Array.isArray(list)) throw new Error("TCGdex's Japanese search answered something else");
	return sortJapaneseNewestFirst(list.map((raw) => japaneseCard(raw, sets, english)));
}

// The cards with this number: in one set when its code was given ("SV2a 151"), else in any set.
async function japaneseCardsNumbered(parsed, sets) {
	// TCGdex writes the numbers of some sets with zeros in front ("025"), so every spelling is asked
	// for: with the set's code too, when there is one.
	const spellings = japaneseNumberSpellings(parsed.number);
	if (parsed.setId) {
		return japaneseCardsWhere("id=eq:" + [...spellings.map((spelling) => parsed.setId + "-" + spelling), parsed.setId + "-" + spellings[0]].join("|"), sets, "");
	}
	return japaneseCardsWhere("localId=eq:" + spellings.join("|"), sets, "");
}

function japaneseNumberSpellings(number) {
	return [...new Set([number, number.padStart(2, "0"), number.padStart(3, "0"), number.padStart(4, "0")])];
}

// The cards among these with this number, in the set the code named (when there is one) and, when
// withTotal and one was read, in a set of that size.
function withJapaneseNumber(cards, parsed, withTotal) {
	return cards.filter((card) =>
		sameNumber(card.number, parsed.number)
		&& (!parsed.setId || card.set.id === parsed.setId)
		&& (!withTotal || !parsed.total || String(card.set.printedTotal) === parsed.total));
}

// The number text as the viewer typed it, for the texts: "SV2a 151/165".
function shownJapaneseNumber(parsed) {
	const number = parsed.total ? parsed.number + "/" + parsed.total : parsed.number;
	return parsed.setId ? parsed.setId + " " + number : number;
}

// What a number text holds: { setId, number, total }, each "" when it holds none. The number, without
// zeros in front ("006" is "6"), is the one before a "/" and the set's size ("151/165"), or a promo's, before
// its code ("001/SV-P"), or else a number on its own ("151", "SV2a 151"). The set is any word in it that is
// a set's code (in any case: the cards print "sv2a", TCGdex writes "SV2a").
function parseJapaneseNumber(text, sets) {
	const upper = String(text || "").toUpperCase();
	let number = "";
	let total = "";
	let codeAfterNumber = "";
	const sized = upper.match(/(?<![A-Z0-9])(\d{1,4})\s*\/\s*(\d{2,4})(?!\d)/);
	const promo = upper.match(/(?<![A-Z0-9])(\d{1,4})\s*\/\s*([A-Z][A-Z0-9-]*)/);
	if (sized) {
		number = sized[1];
		total = String(Number(sized[2]));
	} else if (promo) {
		number = promo[1];
		codeAfterNumber = promo[2];
	} else {
		const alone = upper.match(/(?<![A-Z0-9-])(\d{1,4})(?![A-Z0-9-])/);
		if (alone) number = alone[1];
	}
	let setId = "";
	const words = [codeAfterNumber, ...(upper.match(/[A-Z][A-Z0-9-]*/g) || [])];
	for (const word of words) {
		if (word && sets.byCode.has(word)) {
			setId = sets.byCode.get(word).id;
			break;
		}
	}
	return { setId: setId, number: number ? String(Number(number)) : "", total: total };
}

// Who a name is: { typed, dexIds, english, japanese }. A Japanese name is searched for as it is; an
// English Pokémon name ("Pikachu", "pikacu", "Pikachu ex") by its Pokédex number, which is where a
// Japanese card's English name comes from. A name that is neither (a Trainer's) has no way in: dexIds
// is [] and japanese "".
function whoIsJapaneseName(name) {
	const typed = String(name || "").trim();
	const none = { typed: typed, dexIds: [], english: "", japanese: "" };
	if (!typed) return none;
	if (JAPANESE_LETTERS.test(typed)) return { ...none, japanese: typed };
	const words = typed.split(/\s+/).filter(Boolean);
	// The whole name, then each word, longest first: "Pikachu ex" is Pikachu. Exact, then a near miss
	// ("Pikachy") - the same list the reader checks names against (reader.js).
	const tries = [typed, ...words.sort((a, b) => b.length - a.length)];
	for (const attempt of tries) {
		const key = lettersOnly(attempt);
		if (key.length < 3) continue;
		const exact = POKEMON_KEYS.map((pokemon, index) => (pokemon.key === key ? index + 1 : 0)).filter(Boolean);
		if (exact.length > 0) return { ...none, dexIds: exact, english: POKEMON_NAMES[exact[0] - 1] };
	}
	for (const attempt of tries) {
		const near = matchPokemonName(attempt);
		if (near) {
			const dexId = POKEMON_NAMES.indexOf(near.name) + 1;
			if (dexId > 0) return { ...none, dexIds: [dexId], english: near.name };
		}
	}
	return none;
}

// True when there is enough to try a search on: something typed in the name box, or a digit in the number
// box. (Whether it is a Pokémon's name is for the search to find out.)
function canSearchJapanese(name, numberText) {
	return String(name || "").trim() !== "" || /\d/.test(String(numberText || ""));
}

// ---------- The cards themselves ----------

// A card from TCGdex's list as the app knows it (the same as cards.js's appCard makes for an English one),
// without its prices. english: the card's English name when it is known, put before the Japanese one.
function japaneseCard(raw, sets, english) {
	const setId = raw.id.slice(0, raw.id.lastIndexOf("-"));
	const set = sets.byId.get(setId) || { id: setId, name: setId, printedTotal: null, releaseDate: "" };
	return {
		id: JAPANESE_ID_START + raw.id,
		name: english ? english + " " + raw.name : raw.name,
		number: raw.localId,
		rarity: "",
		supertype: "Pokémon",
		// The set's code first: it is what the card prints, and what people know a Japanese set by.
		set: { id: set.id, name: set.id + " · " + set.name, printedTotal: set.printedTotal, releaseDate: set.releaseDate },
		images: japanesePictures(raw.image, setId, raw.localId, set.printedTotal),
		variants: {},
		// What the database calls it, and its name in Japanese alone (see withJapanesePrices).
		japanese: { id: raw.id, name: raw.name },
	};
}

// Newest set first (a set that isn't in japanese-sets.js came out since: newest), then in number order.
function sortJapaneseNewestFirst(cards) {
	const dateOf = (card) => card.set.releaseDate || "9999";
	return cards.sort((a, b) =>
		dateOf(b).localeCompare(dateOf(a))
		|| a.set.id.localeCompare(b.set.id)
		|| String(a.number).localeCompare(String(b.number), "en", { numeric: true }));
}

// A card's pictures: TCGdex's when it has the card's, else Scrydex's - for the sets of japanese-sets.js
// that Scrydex has pictures of, and only for the numbers up to the set's printed size: above it are the
// secret rares, which Scrydex numbers differently from TCGdex (compared in the 22 sets that have both: up to
// the printed size the same card, all but one of the ones tried, and above it almost every one another card).
// null when neither has.
function japanesePictures(image, setId, localId, printedTotal) {
	if (image) return { small: image + PICTURE_SMALL, large: image + PICTURE_LARGE };
	const code = (JAPANESE_SETS[setId] || [])[1];
	if (!code || !/^\d+$/.test(localId)) return null;
	if (printedTotal && Number(localId) > printedTotal) return null;
	const address = SCRYDEX_PICTURES + code + "_ja-" + Number(localId);
	return { small: address + "/small", large: address + "/large" };
}

// ---------- Prices and the rest of a card's page ----------

// Adds the card's prices to it - Cardmarket's, in euros: TCGdex has no TCGplayer prices for Japanese
// cards - and what only the card's own page tells: its rarity, its kind (Pokémon, Trainer or Energy),
// which prints exist, and its English name from its Pokédex number. Asked from TCGdex once per visit, or
// kept from the last day (see askTcgdex). fresh = true asks again even so. Throws when TCGdex doesn't
// answer; the card then stays without prices.
async function withJapanesePrices(card, fresh = false) {
	if (card.pricesLoaded && !fresh) return card;
	const id = card.japanese.id;
	if (!japanesePricesAsked.has(id) || fresh) {
		const asking = askTcgdex(TCGDEX_JA_API + "/cards/" + encodeURIComponent(id), null, fresh);
		asking.catch(() => japanesePricesAsked.delete(id));
		japanesePricesAsked.set(id, asking);
	}
	const full = await japanesePricesAsked.get(id);
	const prices = pricesFrom(full.pricing);
	if (prices.cardmarket) card.cardmarket = prices.cardmarket;
	if (full.rarity && full.rarity !== "None") card.rarity = full.rarity;
	if (full.category) card.supertype = full.category === "Pokemon" ? "Pokémon" : full.category;
	if (full.variants) card.variants = full.variants;
	const english = POKEMON_NAMES[(full.dexId || [])[0] - 1];
	if (english && !card.name.startsWith(english)) card.name = english + " " + card.japanese.name;
	card.pricesLoaded = true;
	return card;
}
