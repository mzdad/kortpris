# Kortpris roadmap

What to build next, and why. Started 26 September 2026 at version 1.25.0, and kept up to date:
finished items move to "Done" with their version, and keep their number. Biggest wins first
within each part; the size is a rough guess of the work (S = an hour or two, M = a session,
L = several sessions).

## Done in 1.39.0

- **"Install app" at the top.** You asked for a button at the top, like Kids mode, that says how
  to install the app on different devices. "Install app" now sits beside the currency and opens
  a guide with numbered steps for iPhone and iPad (Safari's Share button, "Add to Home Screen"),
  Android (Chrome's menu, and Samsung Internet), Chromebook, computers (Chrome, Edge, and Safari on
  a Mac) and Firefox and other browsers. The guide for the device in hand is marked "Your device",
  comes first and is the only one unfolded. Where the browser offers to install (Android, Chrome,
  Edge), a yellow "Install Kortpris" button does it in one tap. It replaces the "Put Kortpris on
  your home screen" panel further down the Scan screen. The button is hidden in kids mode and in
  the installed app. Tested in the test browser: the right guide for an iPhone, Android, a
  Chromebook, Windows and Firefox; closing with ✕, Esc and a tap outside; the Install button; kids
  mode and the installed app; English and Danish, light and dark. On the smallest iPhones (SE)
  the Danish top wraps onto three lines; from the ordinary iPhone width up it stays on two.

## Done in 1.38.0

- **3.2 The camera takes the photo by itself.** With "Auto" on - the button at the top left of the
  camera, on by itself in kids mode until someone switches it either way - the camera looks for the
  card four times a second, and once the card fills the white frame and the picture has stayed
  still for about a second, the photo is taken. "Hold still…" shows while the card moves. After
  "Save and scan the next", it waits until the frame has been empty, so the card just saved isn't
  taken twice: taking a stack of cards is now put a card in, wait, "Save and scan the next", swap.
  The shutter button still works. Tested in the test browser with a pretend camera: with Auto off
  nothing is taken; on, a still card was taken after 2 seconds and found; a moving card never; after
  "Save and scan the next" the card still there not, and the next one after 1.9 seconds. A look takes
  about 8 ms on the PC. Not yet tried with a real phone camera: how still "still" must be
  (`STILL_CHANGE` in `camera.js`) may need tuning to your phones.

## Done in 1.37.0

- **3.4 Sort and share My cards.** Under the search box: "Sort by" value (as before), name, set
  and number, or the last saved first - remembered on the phone - and "Share list", which sends the
  cards shown (so a search like "holo" shares only those) as text through the phone's own sharing:
  Messages, Mail, Notes. It reads like "1× Charizard · Base Set 4/102 · Holo · DKK 6,093 each",
  with the count and what they are worth at the top. Where a browser can't share, the text is
  copied instead, and the page says so. The search box was already the filter. Kids mode keeps the
  list by value, without these. Tested in the test browser: all four orders, the shared text with
  and without a search, the copy instead, Danish at phone width.

## Done in 1.36.0

- **3.1 Kortpris can be installed as an app.** "Put Kortpris on your home screen" on the Scan
  screen says how: an Install button where Android offers it, Safari's Share button and "Add to Home
  Screen" on an iPhone. Installed, it opens full screen with its own icon (a yellow card on dark
  blue). A service worker keeps the app's files, the text reader, the fonts and the newest 1,500
  card pictures on the phone, so it starts at once - even without internet, showing the cards saved
  on the phone with their pictures. Updates still arrive the first time the app opens, and the old
  version's files are thrown away. On an iPhone the installed app keeps its own saved cards, apart
  from Safari's, so it starts empty until you sign in; the install panel and My cards say so.
  Tested in the test browser: everything kept as planned (30 files, the card pictures), the app
  opened with the local server switched off (all 6 cards and pictures shown), a new version arrived
  on the first opening and the old files went, and development without `?sw` switches it off again.
  Not yet: My cards without internet for signed-in accounts (4.3).

## Done in 1.35.0

- **3.3 Scan a stack of cards.** A card found on the Scan screen now has a yellow "Save and scan
  the next" button next to "Add to my cards": it saves the card and opens the camera again straight
  away, which says "Saved. Fill the frame with the next card". Kids mode has a big one too ("Save,
  then the next card"). A phone without the app's own camera gets its own camera instead. With
  learned cards opening in a moment (1.34.0), a stack you have scanned before goes quickly. Tested
  in the test browser with a pretend camera showing a card photo: save, camera, photo, the next card
  found - and the button is not on a saved card's page in My cards.

## Done in 1.34.0

- **2.1 A learned card opens before its text is read.** The app now finds the card's edges in the
  photo first and compares it with the cards it has learned, and one it knows opens straight away:
  "Recognised… Checking the text on it". The text is still read, as a check. Base Set and Base
  Set 2 print the same picture, and only the number tells them apart: when the text names another
  card exactly, that one is shown instead, with a note saying why. Saving the card or searching
  during the check keeps your choice. A reading now stops when a newer photo comes, so photos taken
  quickly don't queue up behind each other (each held a full-size photo in the phone's memory).
  Tested with the 40 real photos (`dev_learning_test.html`): every made-up second photo was
  recognised before the reading (40 of 40, 0 wrong), 20 of the 23 harder ones, and no photo was
  taken for another card (0 of 80); finding the card and comparing took about 0.1 seconds on the PC.
  In the app, on the PC: a learned Kangaskhan opened after 0.3 seconds, the check was done after
  1.7; a Base Set 2 Mewtwo photo taught as Base Set Mewtwo opened Base Set first and switched to
  Base Set 2 at 2.4 seconds, by its number 10/130. On a phone the reading takes far longer, so the
  gain is bigger there. Cards whose edges aren't found are still recognised after the reading.

## Done in 1.33.1

- **3.6 No "reverse holo" prices for cards never printed that way.** Cardmarket gives some old cards
  reverse holo prices anyway - Base Set Charizard €203, Base Set Pikachu €23 - though reverse holos
  only began in 2002. Since 1.32.0 the version boxes left those out; now the Cardmarket table on a
  card's page does too, by the same rule in one place (`cardmarketReverseCounts`): TCGdex's list of
  the card's prints. Cards that really come as reverse holos keep the rows (Legendary Collection
  and 151 Pikachu), and a card whose prints TCGdex doesn't list shows Cardmarket's prices as before.
  Tested on the six cards of the test browser's made-up collection, and on Charizard without its
  list of prints.

## Done in 1.33.0

- **A saved card opens its page.** You asked to be able to tap a card in My cards and see more
  about it. Tapping one now opens its page right there: the page the Scan screen shows for a card
  it found, with the version you saved picked - today's price of each version, the Cardmarket and
  TCGplayer tables, the PSA prices and "Add one more". "Back to My cards", the My cards button or
  the phone's own Back (a swipe from the left edge on an iPhone) goes back to the list, scrolled to
  where it was; the Scan screen keeps its own card meanwhile. Kids mode gets the kids' page, read
  aloud. Cards saved on the app's first day, before versions were kept, are given the version
  their price already was when their page first opens, so the page says "You have 1". Also: the
  bottom of the page now names TCGdex as where the cards and prices come from, not the old
  database. Tested in the test browser at phone size: open, back (button, tab and browser Back),
  adding from the page, − and + in the list, kids mode in Danish, a database that doesn't answer
  (and "Try again"), and a card the database doesn't have.

## Done in 1.32.1

- **Updates reach the phone at once, and the move to TCGdex brings today's prices.** After 1.32.0
  the total in My cards didn't change on your phone. Most likely it still ran the version before:
  a phone may keep the start page for up to ten minutes (GitHub Pages), and the test browser did
  just that. Now the app asks for the newest start page as it opens, and when that is another
  version, loads again, once. And the cards translated to TCGdex (see 5.1) get today's prices at
  the same time, so the total is right without pressing "Update prices": 5,706 kr became 11,507
  kr in the test browser's made-up collection. Also: cards saved before versions were kept now
  get their main version's price, not the one last picked on the Scan screen.

## Done in 1.32.0

- **5.1 The app runs on TCGdex.** pokemontcg.io, where every card, picture and price came from, is
  being shut down; TCGdex is free, needs no key, and answers web pages directly. A search is now a
  question or two of about 0.2 seconds (the cards with the name, and those with each number read)
  instead of up to a dozen lookups, each sent twice and often failing; the app itself works out
  which cards fit. Prices are asked for one card at a time, as it opens, and are from the same
  day: the reverse holo Legendary Collection Pikachu went from €197 (dated February) to €570, the
  average of the last 30 days. Saved and learned cards are given TCGdex's ids once, in the
  background, on the phone and in the account (`card-ids.js` pairs the two databases' 175 sets;
  "base6-86" is "lc-86"). Cards TCGdex has no picture of borrow the old database's. The card page no
  longer offers a "reverse holo" price for cards never printed that way (Cardmarket lists one for
  Base Set Charizard), as TCGdex lists each card's prints. The PSA relay now gets the card's
  TCGplayer number from the app, and still answers the old way for older app versions. Tested:
  the 40 real photos exactly as before (40 shown first, 38 opened, 0 wrong, 31 numbers read);
  special numbers as before (18 read, 24 first, 22 opened, 0 wrong); full-art as before (22
  names, 20 numbers, 26 opened, 0 wrong); fake photos 14 first, 12 opened (13 before), 0 wrong:
  a Pikachu whose same-picture Base Set 2 twin came within half its distance no longer opens by
  itself. Not solved: the 30th Classic Collection reprints have no pictures in TCGdex yet (the old
  database's are used); the Cardmarket link (Cardmarket's own "Products?idProduct=" form) couldn't
  be tried from here, as Cardmarket stops robots.

## Done in 1.31.0 and 1.31.1

- **2.7 The free database's daily allowance, in part.** Without a key the card database allows
  1,000 lookups a day and 30 a minute per internet connection, and a scan takes from a few to about
  25 (the app asks twice at once, and again when the database fails). When the database says "too
  many requests" (429), the app no longer asks again, up to 12 times, and says so instead: "The
  price database has had too many lookups from this internet connection today. Try again later,
  or on mobile data." The other half, a free key kept in the relay, turned out impossible:
  pokemontcg.io no longer takes new sign-ups and is being shut down (the keys it gave stop working
  on 1 March 2027). The relay route built for the key in 1.31.0 was taken out again in 1.31.1.
  See 5.1.

## Done in 1.30.0

- **1.6 A second look at the number in any photo.** When the reads of the number corners don't
  agree, the corners are cut out again from the card's box made a tenth bigger, and then moved up a
  little, until two reads agree: the box is never found exactly, and tiny print cut out a little
  differently often reads differently. In photos from the app's camera, the white frame comes after
  these. The 40 real photos: 31 numbers read (27 before). Of 62 photos whose first reads didn't agree
  (the real ones, and made-up variants of them), the right number came first in 39 instead of 21,
  and was among the guesses in 46 instead of 33. Made-up camera pictures: 27 of 34 (23). Full-art
  cards: 20 of 27 (19). Special numbers and the fake photos: as before. Nothing opened wrongly in
  the real photos and special numbers; the searches of the fake and full-art photos couldn't be run
  again, as the database's daily allowance was used up (see 2.7). It costs about a second, only on
  the photos whose reads don't agree (about a third of them). A cut a
  twentieth bigger, one moved down and one enlarged more did less; reading the camera's frame first
  lost a number.

## Done in 1.29.0

- **1.4 Learned cards as suggestions.** A photo that looks somewhat like a learned card, but not
  clearly enough to open it (other light, a glare, another copy of the card), now gets that card as
  a suggestion: it joins the cards the text search found, and when nothing is clear it goes first,
  marked "Seen before". It never opens by itself. When nothing could be read at all, the suggestions
  are shown on their own, where before the app gave up. Tapping one teaches the app that photo too,
  so the next photo like it opens straight away. The line is 0.6 (`LIKE_CARD_DISTANCE`): of the 40
  real photos with their own card not learned, one came that close to another learned card, and ten
  within 0.7. In harder made-up second photos of learned cards that weren't recognised for sure, 8 of
  14 suggested cards moved to first place (from places 2 to 7, or "couldn't read the card"); none
  moved down, and nothing opened wrongly. At 0.7, wrong suggestions pushed the right card down a place
  four times. `dev_learning_test.html` now checks harder second photos too: 23 recognised, 4
  suggested (all 4 shown first), 13 neither, none wrong; and with their own card not learned, another
  card was suggested twice and never opened.

## Done in 1.28.0

- **1.3 The names of full-art and gold cards are read.** The strip along the card's top where the
  name is printed is read on its own, enlarged, three ways: as it is, with only its dark ink, and
  with only its white ink. A known name found there, printed at least name-sized, is the card's
  name, even when the read of the whole card found another one (Blastoise ex had been read as
  "Mew"); smaller print in the strip can spell names by chance ("Magby" on a Double Colorless
  Energy). Also: a Trainer's name read
  exactly beats a Pokémon two letters away ("Earthen Vessel" isn't Archen); a logo read stuck to
  the name is cut off ("Incineroar@X"); "Energy Removal" is recognised (its twin "Energy Removal 2"
  used to make it a tie); and small print like "aR 7" is no longer taken for the old number "AR7".
  In fake photos of 27 full-art, gold, rainbow and illustration-rare cards: 22 names read (15
  before), and 26 opened by themselves, where before 3 weren't found at all; none wrong
  (`dev_fullart_test.html`). The 40 real photos: 39 names read (37 before; one is the reverse holo
  Pikachu, long read as "Eevee"), the rest as before. It costs about a second per photo. Not solved: numbers printed white on the artwork (see 1.8), and the strip needs the
  card's edges (see 1.9).

## Done in 1.27.0

- **1.2 Special numbers are read.** Scarlet & Violet promos ("SVP EN 001") are looked for in their
  own set. Numbers of a set within a set are recognised by the set size after the "/", even when
  their tiny letters are misread as digits ("6Go1/6670" is GG01/GG70): Galarian Gallery, Trainer
  Gallery ("TG05/TG30"), both Shiny Vaults ("SV1/SV94", "SV001/SV122"), Radiant Collection
  ("RC1/RC32") and the Aquapolis and Skyridge holos ("H1/H32"). Old one-off codes ("SH10", "SL1",
  "RT1", "AR1") count as promo codes, and a promo code read with a zero too many or too few
  ("XY001", "SWSH0001") still finds its card. In fake photos of 27 such cards: 18 numbers read
  (10 before), 22 opened by themselves (20), none wrong; a Trainer Gallery card that wasn't found
  at all now opens (`dev_special_numbers_test.html`). Not solved: the "SVP" code is printed white
  on black and is only read now and then, so most of these promos still open by their look alone
  (which works). Mega Evolution promos ("MEP") aren't in the free database yet.

## Done in 1.26.0

- **1.1 The camera frame is the card's outline.** A photo from the app's camera tells the reader
  where the white frame was. The card's own edges are still used when they are found close to the
  frame, as they are more exact; otherwise the frame is. And when the number isn't clear from the
  card's edges, it is read once more at the frame's place: tiny print cut out a little differently
  often reads differently. In made-up camera pictures of 17 real cards, held a little off in the
  frame: 16 opened by themselves (15 before), 13 numbers read (11), none wrong. And when the
  card's edges aren't found at all, the frame alone opened 14 of them, where before only 4 of 18
  opened (`dev-local/frame-lab.html`).

## Done in 1.25.0

- **Trainer and Energy names are read.** The reader knew only Pokémon names, so a Trainer card's
  name was thrown away or taken for something else. It now also knows every Trainer and Energy
  card's name (`card-names.js`, 1,480 names) and corrects misreads the same way.
- **Promo numbers are read**, like "SWSH193" on Black Star promos, which have no "/".
- **"Evolves from Galarian Linoone"** no longer turns into the card's name.
- **My cards is split** into Pokémon, Trainer cards and Energy cards.
- **Learned cards are kept in the account** when signed in, so they follow you to every phone and
  aren't lost when the phone's browser forgets them. Needs the new Firebase rules published once
  (see SETUP-ACCOUNTS.md).

## 1. Reading cards better

| | What | Why | Size |
|---|---|---|---|
| 1.5 | **Keep collecting failed photos** in `dev-local/` with the right answers. | Every fix so far came from a real photo that failed. The test set is 40 photos. | ongoing |
| 1.7 | **The set's code on newer cards**: since Scarlet & Violet, cards print their set's code by the number ("PAL EN 123/193"). Read it with the colours turned around, as it is white on black. | The code names the set exactly; today the set is guessed from its size, which several sets share. In 1.27.0 the "SVP" code was read in only about 1 of 3 tries. | M |
| 1.8 | **Numbers printed white on full-art cards**, in italics and edged in black. | 8 of 27 full-art numbers weren't read in 1.28.0, and a white-ink copy of the corner read none of them, so it needs something else, like thinning the black edge away first. The name and the look find these cards anyway. | M |
| 1.9 | **Find the edges of silver-bordered and full-art cards** in photos from the phone's own camera. | The name strip and the number corners need them; 2 of 27 full-art photos had none. So do learned cards: of 13 harder made-up second photos neither recognised nor suggested in 1.29.0, 10 had no edges found (yellow borders in harsh light, there). The app's own camera doesn't need this: its frame gives the edges (1.1). | M |

## 2. Quicker

| | What | Why | Size |
|---|---|---|---|
| 2.2 | **Start the text reader when the page opens**, not at the first photo. | The first scan of a visit waits for a few megabytes to download. | S |
| 2.3 | **Remember database answers for a day** on the phone. | Scanning a card twice, or opening My cards, would not ask again. Worth less since 1.32.0: TCGdex answers in about 0.2 seconds and seldom fails. | S |
| 2.4 | **Read the number first, the name only when needed.** | Name and number are read one after the other. A clear number alone finds the card. | M |
| 2.5 | **Compare fewer pictures**: when only the name is known, the app compares the photo with up to 250 cards' pictures. Using the set size read, or learned cards, narrows that down. | The slowest searches are these. | M |
| 2.6 | **A paid card database (Scrydex)**, from the makers of pokemontcg.io. | Graded prices and picture recognition built in. Costs money (from $29 a month, September 2026): your decision. Since 1.32.0 the free TCGdex (5.1) is quick, reliable and up to date. | M |

## 3. Smoother

| | What | Why | Size |
|---|---|---|---|
| 3.5 | **Hide the camera details** at the bottom of the page once the camera is proven on your phones. | It was added to find out what iPhones give. | S |

## 4. Accounts and keeping things

| | What | Why | Size |
|---|---|---|---|
| 4.1 | **Kids' own accounts under a parent**: see and move cards between them. | Each kid has their own cards. | L |
| 4.2 | **The Claude key in the account**, not only on one phone. | It has to be typed again on every phone. | S |
| 4.3 | **My cards without internet when signed in**: Firestore can keep a copy of the account's cards on the phone. | The installed app on an iPhone needs an account to show your cards (its storage is apart from Safari's), and without internet those wait at "Loading your cards…". Testing it safely needs the Firebase test copy (firebase-tools) installed again. | S |

## 5. Keeping the app working

| | What | Why | Size |
|---|---|---|---|
| 5.2 | **Pictures for the cards TCGdex has none of.** The gallery, vault and some promo cards borrow the old database's pictures, which may go when it does (March 2027). | Without a picture a card can't be compared with a photo, and shows a grey "?". Check again closer to March 2027: TCGdex may have them by then. | S |

**The TCGdex trial (27 September 2026)**, before 5.1 was done. TCGdex (api.tcgdex.net) is free, needs no key, and answers
web pages directly, pictures included. Of 40 requests none failed (pokemontcg.io fails about half),
at about 0.1 seconds per card and 0.2 per name search. Its prices are from the same day, where
pokemontcg.io's Cardmarket prices were months old: Cardmarket (with the reverse holo prices) and
TCGplayer per version, and each card says which versions exist (normal, reverse, holo, 1st
edition). It has 220 sets, newer ones than pokemontcg.io and the Mega Evolution promos (MEP), and
the gallery and vault cards as small sets of their own whose size is the number after the "/"
("GG30/GG70" is Crown Zenith Galarian Gallery, 70 cards). Its differences, which the rebuild must
handle:

- Searching: its GraphQL search finds cards by name (any part of it) and number, with each card's
  set and set size, in one question; the set size is then checked by the app. Every set's name,
  size and release date comes in one more question, kept on the phone. Prices come one card at a
  time, so only for the cards shown. Its digital TCG Pocket sets (series "tcgp") are left out.
- Ids: many are the same ("base1-4", "swsh7-215"), some not: Legendary Collection is "lc-86", 151
  is "sv03.5-025" and Mega Evolution "me01-001" (three digits), the galleries are "swsh12.5gg-GG30"
  and "swsh4.5sv-SV001". Saved and learned cards keep their set's name and number, so they can be
  translated once, and so must the test pages' card lists.
- The 30th Classic Collection reprints are numbered 1 to 30 there, not with their original's
  number, and had no pictures yet ten days after release: their check must go by name, and wait for
  the pictures.
- The PSA relay finds a card's TCGplayer number through pokemontcg.io, which is going too; TCGdex
  gives that number itself. The Cardmarket link must be checked in a browser (Cardmarket refused a
  test from the command line).

## Not planned

- **Non-English cards.** The reader and its name lists are English only (TCGdex has other languages, not Danish).
- **Grading a card's condition from the photo.** Too unreliable for prices that differ this much.
