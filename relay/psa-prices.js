// Kortpris PSA price relay. Runs on Cloudflare Workers (free plan), not in the app itself.
//
// Why a relay: PSA prices come from pokemonpricetracker.com, which needs a secret key, and it
// refuses to be asked straight from a web page. This small program holds the key - as a
// Cloudflare secret named PPT_API_KEY, never written in this file - asks for the app, and
// hands back only the PSA prices of one card.
//
// Ask:    GET https://<this relay>/?card=base6-86        (the card's id in pokemontcg.io)
// Answer: { card, grades: [{ grade: "10", count, median, average }, ...], found }
//         Prices are in US dollars: what the card sold for on eBay in that PSA grade.
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

export default {
	async fetch(request, env, context) {
		const origin = request.headers.get("Origin") || "";
		const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
		if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) });
		if (origin && !ALLOWED_ORIGINS.includes(origin)) return reply({ error: "not allowed" }, 403, allowOrigin);

		const url = new URL(request.url);
		const cardId = url.searchParams.get("card") || "";
		if (!CARD_ID_SHAPE.test(cardId)) return reply({ error: "card id missing or odd" }, 400, allowOrigin);
		const raw = url.searchParams.get("raw") === "1";   // the price service's own answer, for checking

		// Asked already today: the remembered answer costs no credits.
		const memoryKey = (raw ? "raw:" : "card:") + cardId;
		const remembered = env.REMEMBERED ? await env.REMEMBERED.get(memoryKey) : null;
		if (remembered) return reply(JSON.parse(remembered), 200, allowOrigin, REMEMBER_SECONDS);

		let answer;
		try {
			answer = await gradedPrices(cardId, env.PPT_API_KEY, raw);
		} catch (problem) {
			// Not remembered: the next ask tries again.
			return reply({ error: String(problem.message || problem) }, 502, allowOrigin);
		}
		if (env.REMEMBERED) {
			context.waitUntil(env.REMEMBERED.put(memoryKey, JSON.stringify(answer), { expirationTtl: REMEMBER_SECONDS }));
		}
		return reply(answer, 200, allowOrigin, REMEMBER_SECONDS);
	},
};

async function gradedPrices(cardId, apiKey, raw) {
	if (!apiKey) throw new Error("the relay has no PPT_API_KEY secret");
	const productId = await tcgplayerProductId(cardId);
	if (!productId) return { card: cardId, found: false, grades: [] };

	const address = PRICE_API + "?tcgPlayerId=" + productId + "&includeEbay=true&limit=1";
	const response = await fetch(address, { headers: { Authorization: "Bearer " + apiKey } });
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
	return match ? match[1] : null;
}

function psaGrades(body) {
	// Finds every "psa10", "psa9", "psa8"... entry in the answer, wherever it sits, and keeps
	// the sale count and prices. Best grade first.
	const found = new Map();
	const visit = (value) => {
		if (!value || typeof value !== "object") return;
		for (const [key, inner] of Object.entries(value)) {
			const grade = key.match(/^psa[_-]?(\d+(?:\.5)?)$/i);
			if (grade && inner && typeof inner === "object" && !found.has(grade[1])) {
				const entry = {
					grade: grade[1],
					count: numberOrNull(inner.count ?? inner.salesCount ?? inner.sales),
					median: numberOrNull(inner.medianPrice ?? inner.median),
					average: numberOrNull(inner.averagePrice ?? inner.avg ?? inner.average),
				};
				if (entry.median !== null || entry.average !== null) found.set(grade[1], entry);
			} else {
				visit(inner);
			}
		}
	};
	visit(body);
	return [...found.values()].sort((a, b) => Number(b.grade) - Number(a.grade));
}

function numberOrNull(value) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : null;
}

function reply(data, status, allowOrigin, maxAgeSeconds = 0) {
	const headers = corsHeaders(allowOrigin);
	headers["Content-Type"] = "application/json; charset=utf-8";
	headers["Cache-Control"] = maxAgeSeconds > 0 ? "public, max-age=" + maxAgeSeconds : "no-store";
	return new Response(JSON.stringify(data), { status: status, headers: headers });
}

function corsHeaders(allowOrigin) {
	return {
		"Access-Control-Allow-Origin": allowOrigin,
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Vary": "Origin",
	};
}
