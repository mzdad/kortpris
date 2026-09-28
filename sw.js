"use strict";

// Kortpris's service worker: a small script the browser keeps beside the app, which answers the
// app's requests for files. It keeps the app's own files, the text reader, the fonts and the card
// pictures on the phone, so the app starts at once and opens without internet (app.js registers
// it). The card database, the prices and accounts go to the internet: the app itself keeps the
// card database's answers for a day, in a cache of its own (ANSWERS, see askTcgdex in cards.js).
//
// How each kind of request is answered:
// - The start page: from the internet, checked to be the newest, so an update arrives at once -
//   or the copy kept, when the internet doesn't answer within PAGE_WAIT_MS.
// - The app's own files end in ?v=<version> (see README), so an address never holds another file:
//   kept the first time, then answered from the phone. Files of older versions are thrown away when
//   a start page of a newer version arrives.
// - The text reader, Firebase's files and the fonts also never change at their addresses: kept.
// - Card pictures: kept too, the newest MOST_PICTURES of them.

const FILES = "kortpris-files";
const PICTURES = "kortpris-pictures";
// Kept by the app itself, not by this file - but in the same Cache Storage, so it must be spared.
const ANSWERS = "kortpris-answers";
// Pokémon card pictures are about 20 KB each and Magic cards' about 80 KB, so this is 30 to 120 MB
// at most.
const MOST_PICTURES = 1500;
// The oldest pictures are thrown away after this many new ones, not after every one.
const PICTURES_BETWEEN_TIDYING = 50;
// How long the start page may take from the internet before the copy kept is shown instead.
const PAGE_WAIT_MS = 3000;
// Other places whose files never change at the same address: [host, start of the path].
const FIXED_FILE_PLACES = [
	["cdn.jsdelivr.net", "/npm/tesseract"],
	["www.gstatic.com", "/firebasejs/"],
	["fonts.googleapis.com", "/"],
	["fonts.gstatic.com", "/"],
];
// Where the card pictures come from (see picturesOf in cards.js, and magicCard in magic.js).
const PICTURE_HOSTS = ["assets.tcgdex.net", "images.pokemontcg.io", "images.scrydex.com", "cards.scryfall.io"];

self.addEventListener("install", () => {
	// A new version of this file starts working at once, not only when every open app has closed.
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil((async () => {
		// Whatever an older version of this file kept under other names goes.
		for (const name of await caches.keys()) {
			if (name !== FILES && name !== PICTURES && name !== ANSWERS) await caches.delete(name);
		}
		// The app pages open right now are answered by this file from now on too.
		await self.clients.claim();
	})());
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (isStartPage(url)) {
		event.respondWith(startPage(event));
	} else if (url.origin === self.location.origin && url.searchParams.has("v")) {
		event.respondWith(keptFirst(event, FILES));
	} else if (FIXED_FILE_PLACES.some(([host, path]) => url.hostname === host && url.pathname.startsWith(path))) {
		event.respondWith(keptFirst(event, FILES));
	} else if (PICTURE_HOSTS.includes(url.hostname)) {
		event.respondWith(keptFirst(event, PICTURES));
	}
	// Everything else - the card database, prices, accounts, the test pages - goes to the
	// internet as if this file weren't here.
});

function isStartPage(url) {
	const home = new URL(self.registration.scope);
	return url.origin === home.origin && (url.pathname === home.pathname || url.pathname === home.pathname + "index.html");
}

// The start page: asked for from the internet, which checks it is the newest (only a few bytes
// when nothing changed), and kept for next time. When the internet doesn't answer within
// PAGE_WAIT_MS, or not at all, the copy kept is shown - and the newest arrives next time.
async function startPage(event) {
	const cache = await caches.open(FILES);
	// Kept under one address, whatever the page's address ends in ("?emulator").
	const keptAs = self.registration.scope;
	const fromInternet = fetch(event.request.url, { cache: "no-cache", credentials: "same-origin" }).then(async (response) => {
		if (response.ok) {
			await cache.put(keptAs, response.clone());
			await throwAwayOlderVersions(cache, response.clone());
		}
		return response;
	});
	event.waitUntil(fromInternet.catch(() => {}));
	const kept = await cache.match(keptAs);
	if (!kept) return fromInternet;   // the very first visit: nothing kept yet
	const answered = fromInternet.then((response) => (response.ok ? response : kept), () => kept);
	const tooSlow = new Promise((resolve) => setTimeout(() => resolve(kept), PAGE_WAIT_MS));
	return Promise.race([answered, tooSlow]);
}

// The app's own files of other versions than the start page's (its app.js?v=...) aren't needed any more.
async function throwAwayOlderVersions(cache, page) {
	const version = ((await page.text()).match(/app\.js\?v=([0-9.]+)/) || [])[1];
	if (!version) return;
	for (const request of await cache.keys()) {
		const url = new URL(request.url);
		if (url.origin === self.location.origin && url.searchParams.has("v") && url.searchParams.get("v") !== version) {
			await cache.delete(request);
		}
	}
}

// Answered from the phone when kept there; otherwise from the internet, and kept when it came
// whole. (An answer the page may not look inside - an "opaque" one - isn't kept: browsers count
// each as megabytes.)
async function keptFirst(event, cacheName) {
	const cache = await caches.open(cacheName);
	const kept = await cache.match(event.request);
	if (kept) return kept;
	const response = await fetch(event.request);
	if (response.ok) {
		event.waitUntil((async () => {
			await cache.put(event.request, response.clone());
			if (cacheName === PICTURES) await tidyPictures(cache);
		})());
	}
	return response;
}

// Only the newest MOST_PICTURES card pictures are kept: the oldest go first.
let picturesSinceTidying = 0;
async function tidyPictures(cache) {
	picturesSinceTidying++;
	if (picturesSinceTidying < PICTURES_BETWEEN_TIDYING) return;
	picturesSinceTidying = 0;
	const kept = await cache.keys();   // oldest first
	for (const request of kept.slice(0, Math.max(0, kept.length - MOST_PICTURES))) await cache.delete(request);
}
