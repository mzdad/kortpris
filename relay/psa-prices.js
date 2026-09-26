// Kortpris PSA price relay. Runs on Cloudflare Workers (free plan), not in the app itself.
//
// Why a relay: PSA prices come from pokemonpricetracker.com, which needs a secret key, and it
// refuses to be asked straight from a web page. This small program holds the key - as a
// Cloudflare secret named PPT_API_KEY, never written in this file - asks for the app, and
// hands back only the PSA prices of one card.
//
// Ask:    GET https://<this relay>/?card=base6-86        (the card's id in pokemontcg.io)
// Answer: { card, grades: [{ grade: "10", count, median, average }, ...], found,
//           cardsLeft, resetsAt }
//         Prices are in US dollars: what the card sold for on eBay in that PSA grade.
//         cardsLeft is how many more cards can be looked up today; resetsAt when that refills.
// Ask:    GET https://<this relay>/?credits=1   ->  { cardsLeft, resetsAt }   (costs nothing)
//
// Each card is remembered for a day in Cloudflare's key-value store (named REMEMBERED in
// wrangler.toml), because the prices only change once a day and the free plan allows 100
// credits a day (a card costs 2).

const PRICE_API = "https://www.pokemonpricetracker.com/api/v2/cards";
// pokemontcg.io forwards this address to the card's page on TCGplayer, whose product number
// is how pokemonpricetracker.com knows the card.
const TCGPLAYER_LINK = "https://prices.pokemontcg.io/tcgplayer/";
// Only the app may use this relay, so strangers can't use up the day's credits from a web page.
const ALLOWED_ORIGINS = ["https://mzdad.github.io", "http://localhost:8765"];
const REMEMBER_SECONDS = 24 * 60 * 60;
// Card ids look like "base6-86", "swsh7-215" or "me55c-106m".
const CARD_ID_SHAPE = /^[a-z0-9.]+-[A-Za-z0-9]+$/;
// The free plan's credits a day, refilled at midnight UTC, and what one card costs. The price
// service says how many credits are left with every answer; the relay keeps the latest report
// (under CREDITS_KEY) so the app can show it without spending anything.
const DAILY_CREDITS = 100;
const CREDITS_PER_CARD = 2;
const CREDITS_KEY = "credits";

export default {
	async fetch(request, env, context) {
		const origin = request.headers.get("Origin") || "";
		const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
		if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) });
		if (origin && !ALLOWED_ORIGINS.includes(origin)) return reply({ error: "not allowed" }, 403, allowOrigin);

		const url = new URL(request.url);
		if (url.searchParams.get("credits") === "1") return reply(await allowance(env), 200, allowOrigin);

		const cardId = url.searchParams.get("card") || "";
		if (!CARD_ID_SHAPE.test(cardId)) return reply({ error: "card id missing or odd" }, 400, allowOrigin);
		const raw = url.searchParams.get("raw") === "1";   // the price service's own answer, for checking

		// Asked already today: the remembered answer costs no credits.
		const memoryKey = (raw ? "raw:" : "card:") + cardId;
		const remembered = env.REMEMBERED ? await env.REMEMBERED.get(memoryKey) : null;
		if (remembered) return reply({ ...JSON.parse(remembered), ...(await allowance(env)) }, 200, allowOrigin);

		let answer;
		try {
			answer = await gradedPrices(cardId, env, raw);
		} catch (problem) {
			// Not remembered: the next ask tries again. 429 = the day's credits are used up.
			const status = problem.usedUp ? 429 : 502;
			return reply({ error: String(problem.message || problem), ...(await allowance(env)) }, status, allowOrigin);
		}
		if (env.REMEMBERED) {
			context.waitUntil(env.REMEMBERED.put(memoryKey, JSON.stringify(answer), { expirationTtl: REMEMBER_SECONDS }));
		}
		return reply({ ...answer, ...(await allowance(env)) }, 200, allowOrigin);
	},
};

async function gradedPrices(cardId, env, raw) {
	if (!env.PPT_API_KEY) throw new Error("the relay has no PPT_API_KEY secret");
	const productId = await tcgplayerProductId(cardId);

	const address = PRICE_API + "?tcgPlayerId=" + productId + "&includeEbay=true&limit=1";
	const response = await fetch(address, { headers: { Authorization: "Bearer " + env.PPT_API_KEY } });
	// Every answer, even a refusal, says how many credits are left today.
	const left = Number(response.headers.get("X-RateLimit-Daily-Remaining"));
	if (response.status === 429) {
		await rememberCredits(env, 0);
		const problem = new Error("the day's PSA lookups are used up");
		problem.usedUp = true;
		throw problem;
	}
	if (response.headers.has("X-RateLimit-Daily-Remaining") && Number.isFinite(left)) await rememberCredits(env, left);
	if (!response.ok) throw new Error("price service answered " + response.status);
	const body = await response.json();
	if (raw) return body;
	const grades = psaGrades(body);
	return { card: cardId, found: grades.length > 0, grades: grades };
}

async function tcgplayerProductId(cardId) {
	// The link answers with a redirect to ".../product/88075"; the number is all that's needed.
	const response = await fetch(TCGPLAYER_LINK + cardId, { redirect: "manual" });
	const location = response.headers.get("Location") || "";
	const match = location.match(/product\/(\d+)/) || decodeURIComponent(location).match(/product\/(\d+)/);
	// Not found is not remembered: it may only be the link service having a bad moment.
	if (!match) throw new Error("no TCGplayer number for " + cardId + " (answer " + response.status + " " + location.slice(0, 120) + ")");
	return match[1];
}

function psaGrades(body) {
	// The answer lists the card's eBay sales per grade under data.ebay.salesByGrade: "psa10",
	// "psa9", "psa8_5" (that is 8.5) and so on, next to other graders (cgc, bgs, tag) that the
	// app doesn't show. Best grade first.
	const card = Array.isArray(body.data) ? body.data[0] : body.data;
	const salesByGrade = (card && card.ebay && card.ebay.salesByGrade) || {};
	const grades = [];
	for (const [key, sales] of Object.entries(salesByGrade)) {
		const match = key.match(/^psa(\d+)(_5)?$/);
		if (!match || !sales) continue;
		const entry = {
			grade: match[2] ? match[1] + ".5" : match[1],
			count: numberOrNull(sales.count),
			median: numberOrNull(sales.medianPrice),
			average: numberOrNull(sales.averagePrice),
		};
		if (entry.median !== null || entry.average !== null) grades.push(entry);
	}
	return grades.sort((a, b) => Number(b.grade) - Number(a.grade));
}

async function rememberCredits(env, credits) {
	if (!env.REMEMBERED) return;
	// Kept a little over a day: a report from an earlier day means the credits were refilled.
	await env.REMEMBERED.put(CREDITS_KEY, JSON.stringify({ day: utcDay(new Date()), credits: credits }),
		{ expirationTtl: 2 * REMEMBER_SECONDS });
}

async function allowance(env) {
	// How many cards can still be looked up today, and when the credits are refilled.
	const saved = env.REMEMBERED ? JSON.parse((await env.REMEMBERED.get(CREDITS_KEY)) || "null") : null;
	const credits = saved && saved.day === utcDay(new Date()) ? saved.credits : DAILY_CREDITS;
	return { cardsLeft: Math.floor(credits / CREDITS_PER_CARD), resetsAt: nextUtcMidnight().toISOString() };
}

function utcDay(date) {
	return date.toISOString().slice(0, 10);   // "2026-09-25": the price service's days run on UTC
}

function nextUtcMidnight() {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

function numberOrNull(value) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : null;
}

function reply(data, status, allowOrigin) {
	// Never kept by the browser: every answer carries today's count, which changes. The app
	// keeps the prices itself (graded.js), and this relay remembers them in REMEMBERED.
	const headers = corsHeaders(allowOrigin);
	headers["Content-Type"] = "application/json; charset=utf-8";
	headers["Cache-Control"] = "no-store";
	return new Response(JSON.stringify(data), { status: status, headers: headers });
}

function corsHeaders(allowOrigin) {
	return {
		"Access-Control-Allow-Origin": allowOrigin,
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Vary": "Origin",
	};
}
