"use strict";

// Showing prices in the viewer's own currency. The shops price cards in euros (Cardmarket) and
// US dollars (TCGplayer); both are converted with the European Central Bank's daily rates,
// fetched from Frankfurter (frankfurter.dev - free, no key).

// The currencies to choose from, in the order the menu shows them.
const CURRENCIES = ["DKK", "EUR", "GBP", "IDR"];
const DEFAULT_CURRENCY = "DKK";
const CURRENCY_STORAGE_KEY = "kortpris.currency";
const RATES_STORAGE_KEY = "kortpris.rates";
const RATES_URL = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=DKK,GBP,IDR,USD";
// The central bank sets new rates once a working day, so saved rates are reused for this long.
const RATES_MAX_AGE_MS = 12 * 60 * 60 * 1000;
// The Danish krone is pegged to the euro at this central rate, so kroner work even before
// today's rates have arrived, or without internet.
const DKK_PER_EUR_PEG = 7.46038;

// How much of each currency one euro buys. loadRates() fills in the rest.
let euroRates = { EUR: 1, DKK: DKK_PER_EUR_PEG };
let ratesDate = null;   // the day the central bank set the rates, like "2026-09-23", or null

function startCurrency() {
	const saved = readStorage(CURRENCY_STORAGE_KEY);
	return CURRENCIES.includes(saved) ? saved : DEFAULT_CURRENCY;
}

function saveCurrency(currency) {
	writeStorage(CURRENCY_STORAGE_KEY, currency);
}

// Fetches today's rates, or reuses ones saved on this phone in the last few hours.
// Never throws: without rates, only euros and kroner can be shown.
async function loadRates() {
	const saved = readSavedRates();
	if (saved && Date.now() - saved.fetchedAt < RATES_MAX_AGE_MS) {
		useRates(saved);
		return;
	}
	try {
		const response = await fetch(RATES_URL);
		if (!response.ok) throw new Error("Exchange rates answered " + response.status);
		const body = await response.json();
		const fresh = { rates: body.rates, date: body.date, fetchedAt: Date.now() };
		writeStorage(RATES_STORAGE_KEY, JSON.stringify(fresh));
		useRates(fresh);
	} catch (error) {
		console.error(error);
		if (saved) useRates(saved);   // yesterday's rates beat none
	}
}

function readSavedRates() {
	try {
		const saved = JSON.parse(readStorage(RATES_STORAGE_KEY) || "null");
		return saved && saved.rates ? saved : null;
	} catch (error) {
		return null;
	}
}

function useRates(saved) {
	euroRates = { ...saved.rates, EUR: 1 };
	ratesDate = saved.date || null;
}

// True when prices can be shown in this currency right now.
function canShowCurrency(currency) {
	return euroRates[currency] > 0;
}

// A euro amount in another currency, or null when that rate isn't known.
function fromEuros(eur, currency) {
	return euroRates[currency] > 0 ? eur * euroRates[currency] : null;
}

// A dollar amount in another currency (by way of euros), or null when a rate isn't known.
function fromDollars(usd, currency) {
	if (!(euroRates.USD > 0)) return null;
	return fromEuros(usd / euroRates.USD, currency);
}
