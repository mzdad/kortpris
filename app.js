"use strict";

// ---------- Settings ----------

// The Danish krone is pegged to the euro at this central rate, so the conversion stays accurate.
const DKK_PER_EUR = 7.46038;
// Prices older than this get an "out of date" label.
const STALE_AFTER_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXAMPLE_CARD_IMAGE = "https://images.pokemontcg.io/base1/4_hires.png";
// Where the phone remembers the chosen language between visits.
const LANGUAGE_STORAGE_KEY = "kortpris.language";

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
	searchButton.disabled = true;

	let reading = { name: "", number: "" };
	try {
		reading = await readCardPhoto(imageFile, (stage, fraction) => {
			if (scanId !== latestScanId) return;
			if (stage === "reading") {
				setStatus("reading");
				showProgress(fraction);
			} else if (stage === "loading") {
				setStatus("readerStartingSlow");
				showProgress(null);
			} else {
				setStatus("readerStarting");
				showProgress(null);
			}
		});
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

// ---------- Step 2: find the card in the price database ----------

async function searchForCard() {
	const searchId = ++latestSearchId;
	if (!canSearch(nameInput.value, numberInput.value)) {
		hideProgress();
		setStatus("needNameOrNumber", {}, "error");
		return;
	}

	clearResults();
	setStatus("lookingUp");
	showProgress(null);
	searchButton.disabled = true;
	try {
		const found = await findCards(nameInput.value, numberInput.value);
		if (searchId !== latestSearchId) return;   // a newer photo or search took over
		hideProgress();
		if (found.cards.length === 0) {
			setStatus("noMatch", {}, "error");
		} else {
			if (found.cards.length === 1) setStatus("foundOne");
			else setStatus("foundMany", { count: found.cards.length });
			showResults(found.cards, found.description);
		}
	} catch (error) {
		console.error(error);
		if (searchId !== latestSearchId) return;
		hideProgress();
		setStatus("apiDown", {}, "error");
	} finally {
		if (searchId === latestSearchId) searchButton.disabled = false;
	}
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
