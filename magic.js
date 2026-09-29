"use strict";

// Magic: The Gathering cards, with their prices, from Scryfall (scryfall.com): a free card database
// that web pages may ask directly. It has every printing of every Magic card, with its picture and
// its Cardmarket (euros) and TCGplayer (dollars) prices for normal and foil copies, updated daily.
//
// Scryfall's conditions (scryfall.com/docs/api, September 2026): the app stays free and doesn't
// claim Scryfall made it; card pictures are shown as they are; searches are asked at most twice a
// second (see askScryfallNow); and answers are kept for a day, which askScryfall does the way
// askTcgdex in cards.js does for TCGdex's.
//
// A Magic card, as the rest of the app knows it (the same shape as a Pokémon card, see cards.js):
// { id: "mtg:<Scryfall's id>", game: "magic", name, number, rarity, supertype: "Magic",
//   set: { id, name, printedTotal: null, releaseDate }, images: { small, large, thumb },
//   magic: { finishes, eur, eurFoil, usd, usdFoil, usdEtched, cardmarketUrl, tcgplayerUrl, pricesDate },
//   pricesLoaded: true }
// Its prices come with it, so it never waits for them (see withPrices in cards.js).

const SCRYFALL_API = "https://api.scryfall.com";
// (Magic cards' ids start with MAGIC_ID_START, "mtg:" - see isMagicId in cards.js.)
// Saved Magic cards say where their ids are from, as Pokémon cards say "tcgdex" (see CARD_DATABASE).
const MAGIC_DATABASE = "scryfall";
// Scryfall's questions are asked one at a time, this far apart: it allows two searches a second.
const SCRYFALL_GAP_MS = 550;
// Saved cards are asked for this many at a time: Scryfall's most.
const MAGIC_IDS_PER_QUESTION = 75;
// Every search asks for cards you can hold, not the ones only played online (Magic Arena, Magic Online).
const PAPER_CARDS = " game:paper";
// Scryfall's rarities, as shown on a card's page.
const MAGIC_RARITIES = {
	common: "Common", uncommon: "Uncommon", rare: "Rare", mythic: "Mythic rare", special: "Special", bonus: "Bonus",
};

let scryfallTurn = Promise.resolve();   // the question asked last: the next one waits for it

function isMagicCard(card) {
	return Boolean(card) && card.game === "magic";
}

// Searches for the Magic cards with this name, newest printing first, narrowed by the set code and
// number from the card's bottom-left corner when they are typed too ("M11 146"). Returns what
// findCards in cards.js returns - { cards, description, totalCount, exactFound } - plus fixedName:
// the card's real name when the name was misspelt and Scryfall knew which card was meant ("Lightnig
// Bolt"), or null. Throws when Scryfall doesn't answer.
async function findMagicCards(name, numberText) {
	const wanted = name.replace(/["“”]/g, "").trim();
	const { setCode, number } = parseMagicNumber(numberText);
	const filters = (setCode ? " set:" + setCode : "") + (number ? " cn:" + number : "");
	const shown = [setCode.toUpperCase(), number].filter(Boolean).join(" ");
	if (!wanted) {
		// The corner alone: the set code and the number together are one card.
		if (!canSearchMagic(name, numberText)) return { cards: [], description: null, totalCount: 0, exactFound: false, fixedName: null };
		return magicFound(await magicSearch(filters.trim()), { key: "magicSetNumber", values: { number: shown } }, true, null);
	}
	// The name exactly, then the name Scryfall thinks was meant, then every card with those words in it.
	let search = await magicSearch('!"' + wanted + '"' + filters);
	let fixedName = null;
	if (search.cards.length === 0) {
		const meant = await magicNameMeant(wanted);
		if (meant && meant.toLowerCase() !== wanted.toLowerCase()) {
			search = await magicSearch('!"' + meant + '"' + filters);
			if (search.cards.length > 0) fixedName = meant;
		}
	}
	const cardName = fixedName || wanted;
	if (search.cards.length > 0) {
		const description = shown
			? { key: "magicPrintingsNumber", values: { name: cardName, number: shown } }
			: { key: "magicPrintings", values: { name: cardName } };
		return magicFound(search, description, true, fixedName);
	}
	search = await magicSearch(wanted + filters);
	return magicFound(search, { key: "magicNameWords", values: { name: wanted } }, false, null);
}

// True when there is enough to search on: a name, or the set code and the number together.
function canSearchMagic(name, numberText) {
	const { setCode, number } = parseMagicNumber(numberText);
	return name.replace(/["“”]/g, "").trim() !== "" || (setCode !== "" && number !== "");
}

function magicFound(search, description, exactFound, fixedName) {
	if (search.cards.length === 0) return { cards: [], description: null, totalCount: 0, exactFound: false, fixedName: null };
	return {
		cards: search.cards.slice(0, RESULTS_PAGE_SIZE),
		description: description,
		totalCount: search.total,
		exactFound: exactFound,
		fixedName: fixedName,
	};
}

// The set code and collector number typed, as a Magic card prints them in its bottom-left corner:
// "146/249 C" over "M11 • EN" from 2014, "0146 R" over "MOM • EN" from 2023, and before 2014 often
// only "146/249". The number is digits, without zeros in front ("0146" is 146); the set code has 3 to
// 6 letters and digits, at least one a letter ("M11", "10E" for Tenth Edition). The set's size after
// "/", the rarity letter and the language ("EN") are left out. A few old cards' numbers have a letter
// after them ("146a"): taken as the number only beside a set code, as "10E" alone is a set's code.
// Returns { setCode, number }.
function parseMagicNumber(text) {
	const parts = String(text).toLowerCase().split(/[\s•·]+/).filter(Boolean);
	const plain = parts.find((part) => /^\d+(?:\/\d+)?$/.test(part));
	const setCode = parts.find((part) => part !== plain && /^[a-z0-9]{3,6}$/.test(part) && /[a-z]/.test(part)) || "";
	let number = plain ? String(Number(plain.split("/")[0])) : "";
	if (!number) {
		const lettered = parts.find((part) => part !== setCode && /^\d+[a-z]$/.test(part));
		if (lettered) number = String(Number(lettered.slice(0, -1))) + lettered.slice(-1);
	}
	return { setCode, number };
}

// The cards a Scryfall search finds, newest first, and how many there are in all (it answers 175 at
// a time; the first ones are enough to show). Cards that aren't out yet are left out: they have no
// price, and nobody has them.
async function magicSearch(query) {
	const address = SCRYFALL_API + "/cards/search?unique=prints&order=released&dir=desc&q=" + encodeURIComponent(query + PAPER_CARDS);
	const answer = await askScryfall(address);
	if (answer.object !== "list") return { cards: [], total: 0 };   // "not_found": nothing fits
	const today = isoDay(new Date());
	const out = (answer.data || []).filter((raw) => !raw.released_at || raw.released_at <= today);
	const left = (answer.data || []).length - out.length;
	return { cards: out.map(magicCard).filter(Boolean), total: Math.max(0, (answer.total_cards || 0) - left) };
}

// The name Scryfall thinks a misspelt one means ("Lightnig Bolt" is Lightning Bolt), or null when it
// knows none - or too many ("Bolt" fits Lightning Bolt, Firebolt and more).
async function magicNameMeant(name) {
	const answer = await askScryfall(SCRYFALL_API + "/cards/named?fuzzy=" + encodeURIComponent(name));
	return answer.object === "card" ? answer.name : null;
}

// The Magic cards with these ids ("mtg:..."), in the same order; an id Scryfall doesn't have is left
// out. fresh = true asks Scryfall again, even when its answer from earlier today is kept ("Update
// prices" in My cards).
async function findMagicCardsById(ids, fresh = false) {
	const cards = [];
	for (let start = 0; start < ids.length; start += MAGIC_IDS_PER_QUESTION) {
		const some = ids.slice(start, start + MAGIC_IDS_PER_QUESTION);
		const question = { identifiers: some.map((id) => ({ id: id.slice(MAGIC_ID_START.length) })) };
		const answer = await askScryfall(SCRYFALL_API + "/cards/collection", question, fresh);
		cards.push(...(answer.data || []).map(magicCard).filter(Boolean));
	}
	return ids.map((id) => cards.find((card) => card.id === id)).filter(Boolean);
}

// A card from Scryfall as the app knows it (see the top of this file), or null for anything else.
function magicCard(raw) {
	if (!raw || raw.object !== "card" || !raw.id) return null;
	// A card with two faces (turned over during play) has a picture of each: its front is shown.
	const front = Array.isArray(raw.card_faces) ? raw.card_faces[0] : null;
	const pictures = raw.image_uris || (front && front.image_uris) || null;
	const prices = raw.prices || {};
	const shops = raw.purchase_uris || {};
	return {
		id: MAGIC_ID_START + raw.id,
		game: "magic",
		name: raw.name,
		number: raw.collector_number,
		rarity: MAGIC_RARITIES[raw.rarity] || "",
		supertype: "Magic",
		set: { id: raw.set, name: raw.set_name, printedTotal: null, releaseDate: raw.released_at || "" },
		// "normal" (488 × 680) for the search results and the card's page, "small" (146 × 204) for the
		// little pictures in My cards.
		images: pictures ? { small: pictures.normal, large: pictures.large, thumb: pictures.small } : null,
		magic: {
			finishes: Array.isArray(raw.finishes) ? raw.finishes : [],
			eur: priceOrNull(prices.eur),
			eurFoil: priceOrNull(prices.eur_foil),
			usd: priceOrNull(prices.usd),
			usdFoil: priceOrNull(prices.usd_foil),
			usdEtched: priceOrNull(prices.usd_etched),
			cardmarketUrl: shops.cardmarket || "",
			tcgplayerUrl: shops.tcgplayer || "",
			// Scryfall's prices are from today or yesterday: it gathers them once a day.
			pricesDate: isoDay(new Date()).replace(/-/g, "/"),
		},
		pricesLoaded: true,
	};
}

function priceOrNull(text) {
	const value = Number(text);
	return text !== null && text !== undefined && value > 0 ? value : null;
}

function isoDay(date) {
	// "2026-09-28", on this phone's clock.
	return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

// A Magic card's versions, the way cardVersions in app.js gives a Pokémon card's: [{ key, eur, usd }].
// Magic's are its finishes - normal, foil and etched foil - each with its own prices (Scryfall has
// no euro price for etched foil). A version without any price is left out, as for Pokémon cards.
function magicVersions(card) {
	const facts = card.magic;
	const versions = [];
	if (facts.finishes.includes("nonfoil")) versions.push({ key: "normal", eur: facts.eur, usd: facts.usd });
	if (facts.finishes.includes("foil")) versions.push({ key: "foil", eur: facts.eurFoil, usd: facts.usdFoil });
	if (facts.finishes.includes("etched")) versions.push({ key: "etchedFoil", eur: null, usd: facts.usdEtched });
	return versions.filter((version) => version.eur !== null || version.usd !== null);
}

// Asks Scryfall (GET, or POST with a question) and returns its answer: the one kept on the phone, when
// it is less than a day old and fresh isn't true (see keptAnswer in cards.js). "Nothing found" is an
// answer too, kept like any other. Throws when there is no answer (see askScryfallOnce).
async function askScryfall(url, question = null, fresh = false) {
	const keptAs = await answerAddress(url, question);
	if (keptAs && !fresh) {
		const kept = await keptAnswer(keptAs);
		if (kept) return kept;
	}
	const answer = await askScryfallNow(url, question);
	if (keptAs) keepAnswer(keptAs, JSON.stringify(answer));
	return answer;
}

// One question at a time, SCRYFALL_GAP_MS after the one before, so the app never asks more than twice a
// second - however quickly someone taps Search.
function askScryfallNow(url, question) {
	const asking = scryfallTurn.then(() => askScryfallOnce(url, question));
	scryfallTurn = asking.catch(() => {}).then(() => wait(SCRYFALL_GAP_MS));
	return asking;
}

// Asks Scryfall itself, again a couple of times when it doesn't answer. Scryfall's "nothing found"
// (404) is an answer, not a failure. Throws when there is no answer, marked tooManyLookups when
// Scryfall says it was asked too often (429): it then refuses for a while, and asking again only makes
// that longer. The browser's own "User-Agent" goes with every question, as Scryfall asks.
async function askScryfallOnce(url, question) {
	let lastProblem = null;
	for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt++) {
		try {
			const response = await fetch(url, question
				? { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json" }, body: JSON.stringify(question) }
				: { headers: { "Accept": "application/json" } });
			if (response.ok || response.status === 404) return await response.json();
			const problem = new Error("Scryfall answered " + response.status);
			problem.tooManyLookups = response.status === 429;
			// Not allowed, or asked too often: asking again won't change that.
			if (response.status >= 400 && response.status < 500) throw Object.assign(problem, { final: true });
			lastProblem = problem;
		} catch (problem) {
			if (problem.final) throw problem;
			lastProblem = problem;
		}
		if (attempt < MAX_API_ATTEMPTS) await wait(Math.max(SCRYFALL_GAP_MS, RETRY_DELAY_MS * attempt));
	}
	throw lastProblem;
}
