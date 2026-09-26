# Kortpris roadmap

What to build next, and why. Started 26 September 2026 at version 1.25.0, and kept up to date:
finished items move to "Done" with their version, and keep their number. Biggest wins first
within each part; the size is a rough guess of the work (S = an hour or two, M = a session,
L = several sessions).

## Done in 1.31.0

- **2.7 The free database's daily allowance.** Without a key the card database allows 1,000
  lookups a day and 30 a minute per internet connection, and a scan takes from a few to about 25 (the
  app asks twice at once, and again when the database fails). The relay on Cloudflare now also searches the
  database, with a free key kept as its secret (`/cards` in `relay/relay.js`): 20,000 lookups a
  day for the whole app. The app asks through the relay first, and the database directly when the
  relay can't help (no key yet, the key's day used up, or no answer); then it leaves the relay
  alone for 10 minutes. When the database says "too many requests" (429), the app no longer asks
  again (up to 12 times), and says so: "The price database has had too many lookups from this
  internet connection today. Try again later, or on mobile data." **Still to do, by you:** make
  the free account at dev.pokemontcg.io and give the relay its key (steps in `relay/README.md`).
  Until then the app works as before, asking the database directly.

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
| 2.1 | **Recognise learned cards before reading the text.** Finding the card takes a moment; reading the text takes 5 to 20 seconds. | A card the app knows would open in 1 to 2 seconds instead of after the reading. | S |
| 2.2 | **Start the text reader when the page opens**, not at the first photo. | The first scan of a visit waits for a few megabytes to download. | S |
| 2.3 | **Remember database answers for a day** on the phone. | The free price database fails about half its requests, and each retry costs time. Scanning a card twice, or opening My cards, would not ask again. | S |
| 2.4 | **Read the number first, the name only when needed.** | Name and number are read one after the other. A clear number alone finds the card. | M |
| 2.5 | **Compare fewer pictures**: when only the name is known, the app compares the photo with up to 250 cards' pictures. Using the set size read, or learned cards, narrows that down. | The slowest searches are these. | M |
| 2.6 | **A paid price database (Scrydex)**, from the makers of the free one. | Faster and fresher prices, and it doesn't fail half the time. Costs money: your decision. | M |

## 3. Smoother

| | What | Why | Size |
|---|---|---|---|
| 3.1 | **Install it as an app** (home screen icon, opens full screen, starts instantly, My cards works without internet). | Feels like a real app; files load from the phone. Also stops updates from mixing old and new files. | M |
| 3.2 | **Take the photo by itself** when the card fills the frame and the phone is still. | No button to press; great for kids. The steadiness measure exists already. | M |
| 3.3 | **Scan several cards in a row**: after each card, "Save and next" goes straight back to the camera. | Adding a stack of cards to My cards is many taps today. | S |
| 3.4 | **My cards: sort and filter** (by value, set, name, newest) and share the list. | The list grows long. | M |
| 3.5 | **Hide the camera details** at the bottom of the page once the camera is proven on your phones. | It was added to find out what iPhones give. | S |

## 4. Accounts and keeping things

| | What | Why | Size |
|---|---|---|---|
| 4.1 | **Kids' own accounts under a parent**: see and move cards between them. | Each kid has their own cards. | L |
| 4.2 | **The Claude key in the account**, not only on one phone. | It has to be typed again on every phone. | S |

## Not planned

- **Non-English cards.** The free database has English cards only.
- **Grading a card's condition from the photo.** Too unreliable for prices that differ this much.
