"use strict";

// ---------- Settings ----------

const API_URL = "https://api.pokemontcg.io/v2/cards";
// Only ask for the fields we show, so answers arrive faster on mobile data.
const CARD_FIELDS = "id,name,number,rarity,set,images,tcgplayer,cardmarket";
const RESULTS_PAGE_SIZE = 24;
// The free price database fails about half of its requests on the first try
// (measured September 2026), so every lookup is retried a few times.
const MAX_API_ATTEMPTS = 6;
const RETRY_DELAY_MS = 400;
// The Danish krone is pegged to the euro at this central rate, so the conversion stays accurate.
const DKK_PER_EUR = 7.46038;
// Photos are resized to this length (longest side) before reading the text:
// huge phone photos would be slow, and small ones read better when enlarged.
const OCR_TARGET_SIDE_PX = 2000;
// Tesseract rates every word 0-100. Low scores are usually smudges in the artwork, not text.
const MIN_WORD_CONFIDENCE = 55;
// On the name's line, words much smaller than the biggest one are small print, not the name.
const NAME_SIZE_RATIO = 0.7;
// Prices older than this get an "out of date" label.
const STALE_AFTER_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXAMPLE_CARD_IMAGE = "https://images.pokemontcg.io/base1/4_hires.png";
// Where the phone remembers the chosen language between visits.
const LANGUAGE_STORAGE_KEY = "kortpris.language";

// Words printed near the name that are never part of it.
const NOT_NAME_WORDS = new Set([
	"BASIC", "STAGE", "EVOLVES", "HP", "POKEMON", "POKÉMON", "TRAINER", "ITEM", "SUPPORTER",
	"STADIUM", "TOOL", "LV", "LEVEL", "PUT", "THIS", "CARD", "ON", "THE", "OF", "AND",
	"ABILITY", "POWER", "WEAKNESS", "RESISTANCE", "RETREAT", "COST", "ILLUS", "NO",
]);

// TCGplayer splits prices by print version: [its name for the version, our text key].
const TCGPLAYER_VARIANTS = [
	["holofoil", "holofoil"],
	["normal", "normal"],
	["reverseHolofoil", "reverseHolofoil"],
	["1stEditionHolofoil", "firstEditionHolofoil"],
	["1stEditionNormal", "firstEditionNormal"],
	["unlimitedHolofoil", "unlimitedHolofoil"],
	["unlimited", "unlimited"],
];

// Cardmarket figures worth showing, in order. Each name doubles as its text key in strings.js.
// Zero means "no data", so those rows are skipped.
const CARDMARKET_ROWS = [
	"avg30", "avg7", "trendPrice", "averageSellPrice", "lowPrice", "reverseHoloAvg30", "reverseHoloTrend",
];

// ---------- Page elements ----------

const intro = document.getElementById("intro");
const exampleButton = document.getElementById("example-button");
const scanRow = document.getElementById("scan-row");
const photoThumb = document.getElementById("photo-thumb");
const statusText = document.getElementById("status");
const progress = document.getElementById("progress");
const progressBar = document.getElementById("progress-bar");
const searchForm = document.getElementById("search-form");
const nameInput = document.getElementById("name-input");
const numberInput = document.getElementById("number-input");
const searchButton = document.getElementById("search-button");
const detail = document.getElementById("detail");
const results = document.getElementById("results");
const resultsNote = document.getElementById("results-note");
const resultsGrid = document.getElementById("results-grid");
const cameraButton = document.getElementById("camera-button");
const libraryButton = document.getElementById("library-button");
const cameraInput = document.getElementById("camera-input");
const libraryInput = document.getElementById("library-input");
const languageButtons = document.querySelectorAll("[data-language]");

// ---------- What is on screen right now ----------
// Kept as plain data so everything can be redrawn when the language changes.

let language = startLanguage();
let money = makeMoneyFormats(language);
let statusMessage = { key: "statusIdle", values: {}, tone: "" };
let shownCards = [];              // the cards from the latest search
let shownDescription = null;      // which kind of search found them: { key, values }
let selectedCardId = null;        // the card whose prices are open

// Each new photo or search gets a number. When an older one finishes late,
// its answer is thrown away so it can't overwrite the newer one.
let latestScanId = 0;
let latestSearchId = 0;
let ocrWorkerPromise = null;
let photoUrl = null;

applyLanguage();

// ---------- Language ----------

function startLanguage() {
	// Use the language picked last time; otherwise Danish on Danish phones, English elsewhere.
	const saved = readStorage(LANGUAGE_STORAGE_KEY);
	if (saved && STRINGS[saved]) return saved;
	return (navigator.language || "").toLowerCase().startsWith("da") ? "da" : "en";
}

function t(key, values = {}) {
	// Look up a text in the current language and fill in its {markers}.
	const text = STRINGS[language][key] ?? STRINGS.en[key] ?? key;
	return text.replace(/\{(\w+)\}/g, (marker, name) => values[name] ?? marker);
}

function makeMoneyFormats(lang) {
	const locale = NUMBER_LOCALES[lang];
	return {
		locale: locale,
		euros: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }),
		kroner: new Intl.NumberFormat(locale, { style: "currency", currency: "DKK" }),
		dollars: new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }),
	};
}

function applyLanguage() {
	document.documentElement.lang = language;
	money = makeMoneyFormats(language);

	// Fixed text in index.html is marked with the key of its translation.
	for (const element of document.querySelectorAll("[data-text]")) element.textContent = t(element.dataset.text);
	for (const element of document.querySelectorAll("[data-placeholder]")) element.placeholder = t(element.dataset.placeholder);
	for (const element of document.querySelectorAll("[data-label]")) element.setAttribute("aria-label", t(element.dataset.label));
	for (const element of document.querySelectorAll("[data-alt]")) element.alt = t(element.dataset.alt);
	for (const button of languageButtons) button.setAttribute("aria-pressed", String(button.dataset.language === language));

	// Text the app wrote itself is drawn again from the data it came from.
	showStatus();
	renderResults();
}

for (const button of languageButtons) {
	button.addEventListener("click", () => {
		language = button.dataset.language;
		writeStorage(LANGUAGE_STORAGE_KEY, language);
		applyLanguage();
	});
}

// ---------- Buttons ----------

cameraButton.addEventListener("click", () => cameraInput.click());
libraryButton.addEventListener("click", () => libraryInput.click());
cameraInput.addEventListener("change", () => takeFileFrom(cameraInput));
libraryInput.addEventListener("change", () => takeFileFrom(libraryInput));

searchForm.addEventListener("submit", (event) => {
	event.preventDefault();   // stay on this page instead of reloading it
	searchForCard();
});

exampleButton.addEventListener("click", async () => {
	setStatus("downloadingExample");
	showProgress(null);
	try {
		const response = await fetch(EXAMPLE_CARD_IMAGE);
		const image = await response.blob();
		scanPhoto(image);
	} catch (error) {
		console.error(error);
		hideProgress();
		setStatus("exampleFailed", {}, "error");
	}
});

resultsGrid.addEventListener("click", (event) => {
	const button = event.target.closest(".result");
	if (!button) return;
	selectedCardId = button.dataset.cardId;
	renderResults();
	scrollToDetail();
});

function takeFileFrom(input) {
	const file = input.files[0];
	input.value = "";   // so choosing the same photo twice still counts as a change
	if (file) scanPhoto(file);
}

// ---------- Step 1: read the photo ----------

async function scanPhoto(imageFile) {
	const scanId = ++latestScanId;
	latestSearchId++;   // cancel any search still running for the previous card
	intro.hidden = true;
	showPhoto(imageFile);
	clearResults();
	nameInput.value = "";
	numberInput.value = "";
	setStatus("readerStarting");
	showProgress(null);
	searchButton.disabled = true;

	let reading = { name: "", number: "" };
	try {
		const canvas = await photoToCanvas(imageFile);
		reading = await readCardText(canvas);
	} catch (error) {
		console.error(error);
	}
	if (scanId !== latestScanId) return;

	searchButton.disabled = false;
	nameInput.value = reading.name;
	numberInput.value = reading.number;
	if (!reading.name && !reading.number) {
		hideProgress();
		setStatus("readFailed", {}, "error");
		return;
	}
	await searchForCard();
}

function showPhoto(imageFile) {
	if (photoUrl) URL.revokeObjectURL(photoUrl);   // free the memory used by the last photo
	photoUrl = URL.createObjectURL(imageFile);
	photoThumb.src = photoUrl;
	photoThumb.hidden = false;
	scanRow.classList.remove("no-photo");
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
		ocrWorkerPromise = Tesseract.createWorker("eng", 1, { logger: showOcrProgress });
		ocrWorkerPromise.catch(() => { ocrWorkerPromise = null; });   // allow a fresh try next photo
	}
	return ocrWorkerPromise;
}

function showOcrProgress(message) {
	// Tesseract reports what it is doing, plus how far along it is from 0 to 1.
	if (message.status === "recognizing text") {
		setStatus("reading");
		showProgress(message.progress);
	} else {
		setStatus("readerStartingSlow");
	}
}

async function readCardText(canvas) {
	const worker = await getOcrWorker();
	// "blocks" gives every word with its size and position, which is how we find the name.
	const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
	return {
		name: guessCardName(result.data.blocks || []),
		number: guessCardNumber(result.data.text || ""),
	};
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

// ---------- Step 2: find the card in the price database ----------

async function searchForCard() {
	const searchId = ++latestSearchId;
	const nameWord = longestWord(nameInput.value);
	const { number, total } = parseCollectorNumber(numberInput.value);
	if (!nameWord && !number) {
		hideProgress();
		setStatus("needNameOrNumber", {}, "error");
		return;
	}

	clearResults();
	setStatus("lookingUp");
	showProgress(null);
	searchButton.disabled = true;
	try {
		// Try the most exact search first, then looser ones in case the photo was misread.
		for (const attempt of buildSearchAttempts(nameWord, number, total)) {
			const cards = await fetchCards(attempt.query);
			if (searchId !== latestSearchId) return;
			if (cards.length > 0) {
				hideProgress();
				if (cards.length === 1) setStatus("foundOne");
				else setStatus("foundMany", { count: cards.length });
				showResults(cards, attempt.description);
				return;
			}
		}
		hideProgress();
		setStatus("noMatch", {}, "error");
	} catch (error) {
		console.error(error);
		if (searchId !== latestSearchId) return;
		hideProgress();
		setStatus("apiDown", {}, "error");
	} finally {
		if (searchId === latestSearchId) searchButton.disabled = false;
	}
}

function longestWord(name) {
	// Search on the longest word only: "Charizard ex" then also finds "Charizard EX",
	// and a misread short word can't spoil the search.
	let longest = "";
	for (const word of name.split(/\s+/)) {
		const safe = word.replace(/[^\p{L}.'’-]/gu, "");
		if (safe.length > longest.length) longest = safe;
	}
	return longest;
}

function parseCollectorNumber(text) {
	// "4/102" becomes number "4" and total "102". Plain digits lose their leading
	// zeros ("006" -> "6") because the database stores them that way.
	const [numberPart = "", totalPart = ""] = text.toUpperCase().replace(/\s+/g, "").split("/");
	const number = /^\d+$/.test(numberPart) ? String(Number(numberPart)) : numberPart.replace(/[^A-Z0-9]/g, "");
	const total = /^\d+$/.test(totalPart) ? String(Number(totalPart)) : "";
	return { number, total };
}

function buildSearchAttempts(nameWord, number, total) {
	// Each attempt is a database query plus the text explaining what it found.
	const nameQuery = 'name:"' + nameWord + '*"';
	const shownNumber = total ? number + "/" + total : number;
	const attempts = [];
	if (nameWord && number && total) {
		attempts.push({
			query: nameQuery + " number:" + number + " set.printedTotal:" + total,
			description: { key: "matchExact", values: { name: nameWord, number: shownNumber } },
		});
	}
	if (nameWord && number) {
		attempts.push({
			query: nameQuery + " number:" + number,
			description: { key: "matchAnySet", values: { name: nameWord, number: number } },
		});
	}
	if (number && total) {
		attempts.push({
			query: "number:" + number + " set.printedTotal:" + total,
			description: nameWord
				? { key: "matchNumberNameMissed", values: { name: nameWord, number: shownNumber } }
				: { key: "matchNumberOnly", values: { number: shownNumber } },
		});
	}
	if (nameWord) {
		attempts.push({
			query: nameQuery,
			description: { key: "matchNameOnly", values: { name: nameWord } },
		});
	}
	if (!nameWord && number && !total) {
		attempts.push({
			query: "number:" + number,
			description: { key: "matchNumberNoTotal", values: { number: number } },
		});
	}
	return attempts;
}

async function fetchCards(query) {
	const url = API_URL
		+ "?q=" + encodeURIComponent(query)
		+ "&orderBy=-set.releaseDate"
		+ "&pageSize=" + RESULTS_PAGE_SIZE
		+ "&select=" + CARD_FIELDS;
	let lastProblem = null;
	for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt++) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				const body = await response.json();
				return body.data || [];
			}
			lastProblem = new Error("Price database answered " + response.status);
		} catch (error) {
			lastProblem = error;   // no answer at all, e.g. a dropped connection
		}
		await wait(RETRY_DELAY_MS * attempt);   // wait a little longer after each failure
	}
	throw lastProblem;
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Step 3: show the matches and the prices ----------

function showResults(cards, description) {
	shownCards = cards;
	shownDescription = description;
	// Only one match: open its prices straight away, no need to pick.
	selectedCardId = cards.length === 1 ? cards[0].id : null;
	renderResults();
}

function clearResults() {
	shownCards = [];
	shownDescription = null;
	selectedCardId = null;
	renderResults();
}

function renderResults() {
	// Draws the grid of matches and the open card's prices from the data above.
	const selectedCard = shownCards.find((card) => card.id === selectedCardId);
	detail.hidden = !selectedCard;
	detail.innerHTML = selectedCard ? cardDetailHtml(selectedCard) : "";

	results.hidden = shownCards.length < 2;
	if (shownCards.length < 2) {
		resultsGrid.innerHTML = "";
		return;
	}
	let note = t(shownDescription.key, shownDescription.values);
	if (shownCards.length === RESULTS_PAGE_SIZE) note += t("showingFirst", { count: RESULTS_PAGE_SIZE });
	resultsNote.textContent = note;
	resultsGrid.innerHTML = shownCards.map(resultButtonHtml).join("");
}

function resultButtonHtml(card) {
	return `
		<button class="result" type="button" data-card-id="${escapeHtml(card.id)}" aria-pressed="${card.id === selectedCardId}">
			<img class="card-image" src="${escapeHtml(card.images.small)}" alt="" loading="lazy" width="245" height="342">
			<span class="result-name">${escapeHtml(card.name)}</span>
			<span class="result-set">${escapeHtml(card.set.name)}<br><span class="mono">${escapeHtml(collectorNumber(card))}</span></span>
		</button>`;
}

function scrollToDetail() {
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	detail.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

function cardDetailHtml(card) {
	const meta = [escapeHtml(card.set.name), `<span class="mono">${escapeHtml(collectorNumber(card))}</span>`];
	if (card.rarity) meta.push(escapeHtml(card.rarity));

	const worth = [cardmarketStatHtml(card.cardmarket), tcgplayerStatHtml(card.tcgplayer)].join("");
	const noPrices = worth === "" ? `<p class="note">${t("noPrices")}</p>` : "";
	const notYours = shownCards.length === 1 ? `<p class="fineprint">${t("notYours")}</p>` : "";

	return `
		<div class="detail-head">
			<img class="card-image" src="${escapeHtml(card.images.small)}" alt="${escapeHtml(card.name)}" width="245" height="342">
			<div>
				<h2 class="detail-name">${escapeHtml(card.name)}</h2>
				<p class="detail-meta">${meta.join(" · ")}</p>
			</div>
		</div>
		${worth ? `<div class="worth">${worth}</div>` : noPrices}
		${cardmarketTableHtml(card.cardmarket)}
		${tcgplayerTableHtml(card.tcgplayer)}
		<p class="fineprint">${t("ungraded")}</p>
		${notYours}`;
}

function collectorNumber(card) {
	return card.set.printedTotal ? card.number + "/" + card.set.printedTotal : card.number;
}

// Cardmarket is Europe's biggest card shop, priced in euros.

function bestCardmarketPrice(cardmarket) {
	const prices = (cardmarket && cardmarket.prices) || {};
	for (const key of ["avg30", "trendPrice", "averageSellPrice"]) {
		if (prices[key] > 0) return { value: prices[key], key: key };
	}
	return null;
}

function cardmarketStatHtml(cardmarket) {
	const best = bestCardmarketPrice(cardmarket);
	if (!best) return "";
	return `
		<div class="stat">
			<span class="stat-label">${t("cardmarketStat")}</span>
			<span class="stat-value">${money.kroner.format(best.value * DKK_PER_EUR)}</span>
			<span class="stat-sub">${money.euros.format(best.value)} · ${t(best.key)}</span>
		</div>`;
}

function cardmarketTableHtml(cardmarket) {
	if (!bestCardmarketPrice(cardmarket)) return "";
	const rows = CARDMARKET_ROWS
		.filter((key) => cardmarket.prices[key] > 0)
		.map((key) => {
			const value = cardmarket.prices[key];
			return `<tr><td>${t(key)}</td><td>${money.euros.format(value)}</td><td>${money.kroner.format(value * DKK_PER_EUR)}</td></tr>`;
		});
	return `
		<div class="source">
			<h3>Cardmarket</h3>
			${updatedHtml(cardmarket.updatedAt)}
			<table class="price-table">
				<thead><tr><th>${t("cardmarketPrice")}</th><th>${t("euro")}</th><th>${t("kroner")}</th></tr></thead>
				<tbody>${rows.join("")}</tbody>
			</table>
			${storeLinkHtml(cardmarket.url, t("openCardmarket"))}
		</div>`;
}

// TCGplayer is the biggest card shop in the USA, priced in dollars.

function tcgplayerVariants(tcgplayer) {
	const prices = (tcgplayer && tcgplayer.prices) || {};
	const variants = [];
	for (const [apiName, textKey] of TCGPLAYER_VARIANTS) {
		const price = prices[apiName];
		if (price && (price.market > 0 || price.low > 0)) variants.push({ label: t(textKey), price });
	}
	return variants;
}

function tcgplayerStatHtml(tcgplayer) {
	const withMarket = tcgplayerVariants(tcgplayer).filter((variant) => variant.price.market > 0);
	if (withMarket.length === 0) return "";
	const first = withMarket[0];
	return `
		<div class="stat">
			<span class="stat-label">${t("tcgplayerStat")}</span>
			<span class="stat-value">${money.dollars.format(first.price.market)}</span>
			<span class="stat-sub">${first.label} · ${t("marketPrice")}</span>
		</div>`;
}

function tcgplayerTableHtml(tcgplayer) {
	const variants = tcgplayerVariants(tcgplayer);
	if (variants.length === 0) return "";
	const rows = variants.map(({ label, price }) =>
		`<tr><td>${label}</td><td>${formatDollars(price.market)}</td><td>${formatDollars(price.low)}</td></tr>`);
	return `
		<div class="source">
			<h3>TCGplayer</h3>
			${updatedHtml(tcgplayer.updatedAt)}
			<table class="price-table">
				<thead><tr><th>${t("tcgplayerVersion")}</th><th>${t("tcgplayerMarket")}</th><th>${t("tcgplayerLowest")}</th></tr></thead>
				<tbody>${rows.join("")}</tbody>
			</table>
			${storeLinkHtml(tcgplayer.url, t("openTcgplayer"))}
		</div>`;
}

function formatDollars(value) {
	return value > 0 ? money.dollars.format(value) : "–";
}

function updatedHtml(updatedAt) {
	// The database writes dates as "2026/07/01".
	const parts = String(updatedAt || "").split("/").map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) return "";
	const date = new Date(parts[0], parts[1] - 1, parts[2]);
	const daysOld = Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);
	const shownDate = date.toLocaleDateString(money.locale, { day: "numeric", month: "short", year: "numeric" });
	const staleChip = daysOld > STALE_AFTER_DAYS ? `<span class="chip">${ageInWords(daysOld)}</span>` : "";
	return `<p class="updated"><span>${t("pricesFrom", { date: shownDate })}</span>${staleChip}</p>`;
}

function ageInWords(days) {
	if (days < 60) return t("weeksOld", { count: Math.round(days / 7) });
	return t("monthsOld", { count: Math.round(days / 30) });
}

function storeLinkHtml(url, text) {
	if (!/^https:\/\//.test(url || "")) return "";
	return `<a class="store-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${text} ↗</a>`;
}

// ---------- Small helpers ----------

function setStatus(key, values = {}, tone = "") {
	statusMessage = { key, values, tone };
	showStatus();
}

function showStatus() {
	statusText.textContent = t(statusMessage.key, statusMessage.values);
	statusText.classList.toggle("error", statusMessage.tone === "error");
}

function showProgress(fraction) {
	// A number from 0 to 1 fills the bar that far. null means "busy, but no idea how long".
	progress.hidden = false;
	progress.classList.toggle("indeterminate", fraction === null);
	progressBar.style.width = fraction === null ? "" : Math.round(fraction * 100) + "%";
}

function hideProgress() {
	progress.hidden = true;
}

function readStorage(key) {
	// Private browsing can block storage; the app then simply forgets between visits.
	try {
		return localStorage.getItem(key);
	} catch (error) {
		return null;
	}
}

function writeStorage(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch (error) {
		// Not saved - fine, it only matters on the next visit.
	}
}

function escapeHtml(text) {
	// Text from the database is shown as text, never run as page code.
	return String(text ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
