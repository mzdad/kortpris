# Kortpris

Photograph a Pokémon or Magic: The Gathering card on your phone and see what it sells for (Magic
cards: see **Magic: The Gathering cards** below).

**Live at <https://mzdad.github.io/kortpris/>.** Every push to `main` updates it.

A web page with nothing to install. What happens to a photo:

1. **Photo → text.** [Tesseract.js](https://github.com/naptha/tesseract.js) reads the
   card's name and collector number (like `4/102`, or a promo's code like `SWSH193`,
   `SVP EN 001` or `MEP EN 009`) on the phone itself. It starts a second after the app opens (`startReaderEarly`),
   so its download (about 7 MB, once) and start don't hold up the first scan. Numbers of a set within a set, like `GG01/GG70` (Galarian
   Gallery) or `TG05/TG30` (Trainer Gallery), are recognised by the set size after the "/", as
   their tiny letters are often misread as digits: "6Go1/6670" is GG01 (`LETTERED_SETS` in
   `reader.js`). The name is checked against all 1025 Pokémon names and every Trainer and Energy
   card's name (`card-names.js`), so small misreads get corrected. The card is
   found in the photo by its yellow border - counted along lines that may lean a little, as a
   photo is seldom quite straight, and from a single border line when glare hides the others -
   or, for silver-bordered and foil cards, by its shape (`card-finder.js`). A shape that only may
   be the card (a dark card in a toploader on a dark cloth has hardly any colour change around it)
   counts once the number reads sure where that box says it is printed, and a scan - a picture
   with the card's own shape - is the card as a whole (version 1.46.0). A card photographed so
   close that it reaches the photo's edge, or runs past it, is looked for with the photo's edge
   as one or two of its sides, the sides cut off placed by the card's shape; such a box counts
   once the number or the name reads where the box says it is printed (`findCardAtPhotoEdge`,
   version 1.47.0). The strip along its
   top where the name is printed is then read on
   its own, enlarged: as it is, with only its dark ink, and with only its white ink. On full-art
   cards the name sits on the artwork, where a read of the whole card often loses it
   (`readNameStrip`). The number is then read again from the full-size photo, in the
   two small corners where it is printed, several different ways (one of them with only the
   black ink kept, which hides coloured backgrounds and glitter), until two reads agree. When
   they don't, the corners are cut out again from the card's box made a tenth bigger, and then
   moved up a little: the box is never found exactly, and tiny print cut out a little
   differently often reads differently (`NUMBER_RECUTS`). The last two ways are for special
   print: one keeps only the near-white print, for the white italic numbers of full-art and dark
   cards (`whiteInkOnly`), and one only the blackest ink, for black numbers on sparkly foil, where
   the glitter blots the usual black-ink copy and glues the digits together. Cards since
   2023 also print their set's code by the number ("PAF EN 057/091"), white in a little box: it
   is read with only capitals allowed, and kept when that set's size is the one after the "/"
   (`readSetCode`, `set-codes.js`). It then picks among cards that look alike - Black Bolt,
   White Flare and Chaos Rising all have 86 cards. Once the card's edges are found, the number is
   read before the name, as it alone often settles which card it is (see step 2).
2. **Text → card.** The name and number are looked up in [TCGdex](https://tcgdex.dev), a free
   card database that web pages may ask directly: the cards with that name and those with each
   number read come in one quick question each (`cards.js`), and every number the reader thought
   possible is tried against them. (Until version 1.32.0 the app used the Pokémon TCG API,
   pokemontcg.io, which is being shut down. Cards saved or learned before then are given TCGdex's
   ids once, by `card-ids.js`, which also finds Scrydex's picture for TCGdex's cards without
   one.) A right number also finds a card whose
   name was misread, and the name is then corrected. If no number fits, the candidates are sorted by
   how much their picture looks like the photo, and a clear winner opens by itself. Cards
   with the very same picture (a holo and its plain print) are told apart by the number:
   a read "8/64" picks Mr. Mime 6/64, one digit away, over Mr. Mime 22/64. The 2026
   **30th Celebration: Classic Collection** reprints carry their original's number ("69/132"),
   which the database can't search on, so each is added next to its original; a "30" stamp at a
   bottom corner of the picture tells the two apart (`STAMP_CORNERS` in `matcher.js`). The 2021
   **Celebrations Classic Collection** reprints work the same way (version 1.45.0), with a "25"
   stamp in the same place; their originals are listed by id in `CLASSIC_NUMBERS`
   (`card-ids.js`), as the names differ ("Impostor" and "Imposter Professor Oak"). The rules that
   pick among look-alike cards (by set size, set code, number or sparkle) only pick a card that
   looks like the photo at all (`LOOK_ALIKE_MOST_DISTANCE`). When
   both the name and the card's own number are unreadable but the set size isn't (shown as
   `?/110`), the photo is compared with every card from a set of that size. The
   fields stay editable, so a card can also be typed in.

   **The number first** (version 1.42.0). Reading the name takes about as long as reading the
   number, so when two reads of the number agree, the cards with that number (in a set of the
   size read) are looked up and compared with the photo before the name is read
   (`onSureNumber` in `readCardPhoto`, `cardByNumberAlone` in `matcher.js`). A clear winner
   opens and the name is never read - but only when its picture is also close to the photo
   (`NUMBER_ALONE_MOST_DISTANCE`), as a misread number can fit a single, different card.
   Otherwise the name is read and the search goes on as above. On the 46 real photos, 23 opened
   this way, all right, in 1.4 seconds on average; all photos together took 2.9 seconds each
   instead of 3.8 on this PC, with the same cards found and opened.

   All drawing on canvases uses the processor (`willReadFrequently`), not the graphics card:
   graphics cards resize pictures slightly differently from PC to PC, and tiny print on foil
   cards reads differently after even a tiny change (one PC read `86/110`, another `0/110`,
   from the same photo).
3. **Card → prices.** Prices from **Cardmarket** (Europe, euros, also shown in kroner)
   and **TCGplayer** (USA, dollars), with links to both shops. Cardmarket also gives "reverse
   holo" prices for some cards never printed that way (Base Set Charizard); TCGdex lists each
   card's prints, so those are left out (`cardmarketReverseCounts`). A card whose background
   glitters in the photo (below the picture, letters left out) opens on its **reverse holo**
   price, which can be a hundred times the plain one (`sparkle.js`); that also picks the right
   one of two cards with the same picture when only one was ever printed as a reverse holo. **PSA prices** (what the card
   sold for on eBay in each PSA grade) come from PokemonPriceTracker through a small relay on
   Cloudflare that keeps its key secret (`relay/`, see `relay/README.md`). They are only
   fetched while "Fetch PSA prices automatically" is ticked on the card page, because the free
   plan allows about 50 cards a day; prices fetched in the last day are shown either way.
   Each grade's price is the price service's estimate of today's price (recent sales count
   most, odd ones left out), not the middle of months of sales. A menu under the table, closed
   at first, lists every grade with its number of sales, how sure the price is and its last
   sale, the other grading companies' grades (CGC, BGS, SGC, TAG, ACE), and a link to each
   grade's sales on PriceCharting (`gradedMoreHtml`). PriceCharting lists the same eBay sales for
   free and without an account, where eBay shows its sold listings only to people signed in to
   eBay. When its search finds only that card, the link opens the card's page on the grade's list
   of sales; when it finds several, they are listed to pick from (`priceChartingUrl`). Without
   prices, the same kind of line opens links to the most sold grades' sales (`gradedLinksMenuHtml`).
4. **My cards.** Cards can be saved with how many of each, and the list shows the total
   value in kroner. For a stack of cards, "Save and scan the next" on a found card saves it and
   opens the camera again at once. It is split into Pokémon, Trainer cards and Energy cards (the database's
   "supertype"; cards saved before 1.25.0 are asked for theirs when My cards opens). A search box
   narrows the list by name, set, number, version or kind ("jungle holo", "pika", "58",
   "trainer") and says what the cards found are worth together. "Sort by" orders the list by
   value, name, set and number, or the last saved first (remembered on the phone), and "Share
   list" sends the cards shown as text through the phone's own sharing, or copies it where the
   browser can't share. Tapping a card opens its page
   there - the page the Scan screen shows for a card it found, with the saved version picked -
   and "Back to My cards" or the phone's own Back (a swipe on an iPhone) returns to the list.
   Without an account it is kept in the phone's browser only.

**Japanese cards** (version 1.63.0, `japanese.js`, roadmap 6.1). A third choice in the switch, "Japanese",
searches TCGdex's Japanese database - 13,000 cards in 118 sets since 1996, each with its Cardmarket price
in euros (there are no TCGplayer prices, and no PSA prices or sales links for them). You type the
Pokémon's name in English ("Pikachu": its Pokédex number finds the Japanese cards, and gives them their
English name) or in Japanese, and/or the number from the card's bottom-left corner: "151/165", or with the
set's code, "SV2a 151/165"; a promo prints its code after the number, "001/SV-P". A Trainer or Energy card
has a Japanese name only, so it is found by its number. TCGdex's fast search (GraphQL) has English cards only, so
Japanese ones are found with its plain list search (`?dexId=eq:25`, `?localId=eq:151|0151`, `?id=eq:...`,
`?name=...`), which gives only { id, localId, name, image }: the set comes from the id, and the rest (rarity,
kind, prices) from the card's own page when it is opened (`withJapanesePrices`). A Japanese card's id starts
with "ja:", like Magic's "mtg:", as TCGdex's Japanese and English ids can be the same; saved ones have a
group of their own in My cards. Pictures: TCGdex has 30% of them (2022-2024 sets, mostly), and Scrydex has
those of 90 sets, under "sv2a_ja-25" (a set's code in small letters, "_ja", and the number without zeros),
listed in `japanese-sets.js`: only a set with a picture found under that name is used, as a guessed name
(PMCG1 as "pcg1") gave another set's pictures.

**Japanese cards from a photo** (versions 1.64.0 and 1.65.0, `japanese-reader.js`). The text reader knows English only, so
the name (in Japanese) is not read at all. A modern Japanese card prints its number, and its set's code, in plain
letters in the bottom-left corner - "G [sv2a] 151/165 RR", a regulation mark, the code in a little box, the
number and the size of the set, the rarity - and those are read: the number by the Pokémon reader's own
number reading (`readNumberPlacesOfCard`), the code in four more ways (`JAPANESE_CODE_READS`: the tiny code is read by
different ways for different cards) and matched against the sets of that size (`japaneseSetCodeIn`). The cards
with that number in a set of that size are searched for (`findJapaneseCards`) and their pictures compared with the
photo, as for English cards. The code does not name a card when it comes from a photo, as it can be misread and
sets of the same size print the same numbers (SV6a and SV7a): it only puts that set's cards first, and helps
pick among cards that look alike. A card opens by itself when its picture is at most 1.0 from the photo's
(`pickJapaneseCard`); a card with no picture is listed, not opened, after the cards that look like the photo and the
cards of the set the code names. A card lying sideways is turned upright (`lookAtPhoto` with `turnEagerly`: found in the
photo turned either way, see the Pokémon photos paragraph below), and one whose number can't be read is read the other way up. A photo with no number asks for it to be
typed. Learned cards (tap the right one) work for Japanese cards too, kept apart from the other games'
(`learnedOfGame`). Tested with `dev_japanese_test.html`, which makes fake phone photos of 80 Japanese cards from 40
sets since 2016 from their pictures (number read 67, opened by itself 67 right, none wrong), and with real photos in
`dev-local/japanese-photos.json` (4: numbers read 4, the right card first 4, 3 opened by themselves). Not yet: kids mode.

**Japanese cards with Pokémon picked** (version 1.67.0, `japanese-reader.js`). A photo of a Japanese card can be
scanned without picking "Japanese" first (still there, for typing a Japanese search). The photo is read as an English
card, as always; when the English search didn't find the card by its name and number (`mayBeJapanese`: a Japanese
name can't be read), it is read as a Japanese card too (`japaneseCardOfPhoto`, with the numbers the English reading
read counted as well), and when a Japanese card opens by itself (`pickJapaneseCard`) it is shown as with Japanese
picked, the switch staying on Pokémon (`searchJapanesePhoto` in app.js; status `japaneseChecking` meanwhile) -
unless an English card with the name the English reading read looks about as much like the photo: a Japanese name
can't be read in English, so that is the English print of the same card (`englishNameWins`; an English Bulbasaur
whose number was misread opened its Japanese print, with the same picture, without it). Many
sets are printed in both languages with the same numbers and pictures (151 is SV2a in Japanese, Shrouded Fable
SV6a, White Flare SV11W), so an English card then opens by itself only when it looks like the photo (at most
`LOOK_ALIKE_MOST_DISTANCE`, 1.5) and no Japanese card with the number and set size read looks as much like it
(within `SET_SIZE_LOOK_SLACK`, or with no picture to compare): `japaneseDoubt`. Otherwise the English cards are
listed. A card that would open by its number alone, before its name is read, waits for its English name when a
Japanese card with the same number and set size looks as much like the photo (`englishCardIsSure`). Japanese
cards printed no number before July 2001 (`JAPANESE_NUMBERS_PRINTED_FROM`), though TCGdex numbers them: they
don't count (the 1996 set has 102 cards, like the Base Set). Measured: the 84 Japanese photos of
`dev_japanese_test.html?pokemon=1` (`?just=SV11W-007,SM6a-007` tests single cards, with the very photos of a full
run) open 72 right and none wrong, 8.1 s a photo (70 right and 2.5 s with Japanese picked); 3 of the 4 real ones
open, and Chandelure V, which has no picture anywhere, gets the English list. English photos: none taken for a
Japanese card on any test page, and the same cards shown first and opened as in 1.66.0 but for Water Energy 102/102
(listed: Stellar Miracle's blue cave Stadium 102/102 looks about as alike) and, on sideways photos, a Hitmonchan
whose number read "1/102" (listed, as Stellar Miracle's card 1 fits it; the slanted one 1.66.0 opened wrong is
listed too). Slower where a number is misread, as the photo is read as Japanese too: special numbers 3.3 to 4.7 s a
photo, the made-up photos 4.7 to 8.4 s, photos at a 12% angle 9.7 to 14.4 s; upright real photos 3.1 to 3.2 s. Not
in kids mode, which has no Japanese cards.

**Magic: The Gathering cards** (version 1.55.0, `magic.js`). A switch above the search picks the
game, remembered on the phone (`setGame` in `app.js`); in kids mode two big buttons pick it (see Kids mode).
Magic cards come from [Scryfall](https://scryfall.com), free and without a key, and are found from a
photo (see **Magic cards from a photo** below) or by typing: the name - misspelt ones are corrected by Scryfall's own guess, and words that fit no name
exactly list every card with them in its name - and, if typed, the set code and number from the
card's bottom-left corner ("M11 149", `parseMagicNumber`), which pin down one printing. Every
printing is listed, newest first, with its picture; cards not out yet, and those only played
online, are left out. A card's versions are its finishes - normal, foil and etched foil - each with
its Cardmarket (euros) and TCGplayer (dollars) price, which come with the card from Scryfall
(`magicVersions`). Saved Magic cards have ids starting `mtg:`, sit in a "Magic cards" group of their
own in My cards, and "Update prices" asks Scryfall for them 75 at a time. Scryfall's conditions: its
questions are asked one at a time, half a second apart (`askScryfallNow`), its answers are kept
for a day like TCGdex's, and card pictures are shown as they are. The page's foot says where the
cards come from, with the notice Wizards of the Coast's Fan Content Policy asks for. Since 1.56.0 a
card's page links to its sales on PriceCharting like a Pokémon card's, graded and ungraded: the search
is its name, "Magic" and its set as PriceCharting names it ("M11" for Magic 2011,
`priceChartingMagicSearch`), with "Foil" for a foil copy, and for a normal copy PriceCharting's special
editions ([Foil], [Borderless]...) are left out, which mostly leaves the one card, so its page opens
straight away. The PSA price table is still Pokémon only: its price service knows Pokémon cards only.

**Magic cards from a photo** (version 1.57.0, `magic-reader.js`, roadmap 7.2). With Magic picked, a
photo is read in Magic's own way (`scanMagicPhoto` in `app.js`). The card is found by its shape
(`lookAtMagicPhoto`), also lying sideways: then the photo is turned a quarter, as the card is the biggest
card-shaped box that way, where upright only its picture or text box has a card's shape. The name along
the top is read in up to five ways until one fits a name in Scryfall's list of all 36,000 (asked at the
first Magic photo, kept a day; `closestMagicName`): up to one letter in four may be misread, the end of
a long name may be lost, and words the reader read only faintly count only when they spell a long name
exactly, as bits of a frame are easily read as "Fear" or "Pain", which are cards too. A name that fits
nowhere: the card may be upside down, and its other end is read. The faint, embossed names of Ice Age,
Mirage and Urza's Legacy cards have two more ways, tried last (`MAGIC_NAME_READS`): the light print cut
hard, from a strip close around the name, and sparse text in the dark print. Cards from 2014 on print their number,
rarity, set code and language in the bottom-left corner ("246/297 R" over "SOI • EN"): read with only the
light print kept, and a misread code is made a real set's of the size read (`magic-sets.js`: "SOT" is
SOI). Cards from 1998 to 2014 print only "28/350", at the end of the bottom line. The corner's card
opens at once when it has the name read (`findMagicCardsOfPhoto`). Otherwise the name's printings - those
with the number read, if any - are compared with the photo by their pictures (`rankByLook`, with
Scryfall's smallest pictures), and a card opens by itself only when its picture is close to the photo
(`pickMagicCard`). The German, French and Italian black-bordered printings of 1994-95 are left out, as
the English name was read. Old cards that print no number (before 1998) are told apart by the year in the
copyright line at the bottom (`readMagicYear`, version 1.59.0): Fourth Edition prints "1995 Wizards of the
Coast", Summer Magic "Illus. (c) 1994 Anson Maddocks", Revised no year, and later cards a range ("1993-1999"),
of which the last year counts. Four ways of reading it are tried until two agree, and among printings
that look alike, the ones from that year go first (`pickMagicCard`); the others follow, so a misread year
never hides the right card. A Pokémon card photographed with Magic picked is spotted by its yellow border
(`hasPokemonBorder`, from `findYellowCard`) before anything is read, and the status says to pick Pokémon:
read as a Magic card, it would only be given a made-up name. Learned cards work for Magic cards too: tap the
right one in the list, and the
next photo of it opens at once. Tested with `dev_magic_photos_test.html` on 32 real photos (29 cards
from 1994 to 2018, 16 photographed sideways, 4 foils): turned right 32, names read 28, numbers read 10
of the 17 that print one, the right card first 27, opened by itself 20 - all right, none wrong - and 7
years read, all right; none of the Magic photos taken for a Pokémon card, and 37 of the 46 Pokémon photos told apart. Still hard: a foil and its normal copy, the faintest names on old white cards
(Kismet, Kjeldoran Knight), Unlimited and Beta against Revised (only their borders differ), and glare.

**Magic cards in a case** (version 1.69.0, `readMagicCorners`). A card in a magnetic case is often found by the
case's inside edges, a few percent bigger than the card, or by other lines of the case, so the corner cut from the
box held the case's plastic, and the number wasn't read (two foil cards of a friend's, Indoraptor REX 0015 and
Kaalia MH3 0290: the box reached 5% and 20% of the card's height past its bottom). Now, when neither corner reads a
number, a taller strip at the bottom left, reaching past the box (`MAGIC_CORNER_STRIP`), is read in two ways, and
there only a set code with a number, or a number with its set's size ("001/080"), counts, as the strip holds the
rules text too (a third way read a "1" on a Fourth Edition card that prints none). The set size is also read when
the slash after the copyright's "Inc." is lost ("Inc 20 143"). On the 34 photos (`dev-local/magic-photos.json`):
numbers read 14 of 19, before 10; the right card first 29, before 28; opened by itself 23, before 20, none wrong;
2.1 s a photo, before 1.8 (cards that print no number now read the strip too).

**Magic photos quicker** (version 1.70.0). Measured on the 34 photos (scratchpad `magic_timing.js`, each step
timed): 2.2 s a photo, of which matching what was read with the 36,000 names took 0.36 s - more than reading the name
- and the corners 0.95 s, 5.7 reads. Now 1.7 s, with the same cards found and opened:
- `bestNamesFor` rules most names out by their letters alone (`letterCounts`, `fewestMistakes`: a lower bound of
  `editDistance`, so it never rules out a name that would fit), before the slower comparison, and keeps its answers, as
  every way of reading the strip reads the same lines (`MOST_NAME_ANSWERS`). The same answers on 2,998 made-up readings
  as before, 10 times quicker: 0.05 s a photo.
- A name read sure has printings that say where a number or a year can be at all (`placesWorthReading`, with the
  printings asked once per visit, `magicPrintingsOf`): numbers came with Exodus (June 1998, `MAGIC_NUMBERS_FROM`), in
  the bottom-right corner, and moved to the bottom-left with the M15 frame (July 2014, `MAGIC_LEFT_CORNER_FROM`); the
  year tells printings apart only when they came out in more than one year, one of them 1994 to 2003. So a name
  printed only before 1998 reads no corner at all (eight reads saved), and one printed only from 2014 on no right
  corner. 4.4 corner reads a photo, before 5.7; a false "96" an old Storm Shaman's corner gave is gone with it.

**Pokémon photos lying sideways or at an angle** (version 1.66.0, `reader.js` and `card-finder.js`, roadmap 1.12 and
1.13). A photo sent through a messenger can lose which way is up, and a card in a binder pocket, or photographed from
below, has slanted sides. `readCardPhoto` reads a photo once. When that reading is not *sure* of the way up (`isSure`:
two number reads agree on a whole number, or a known name of at least 5 letters is read in the name strip), it takes
second chances, in a time of their own (twice the first reading, at least 5 seconds), and the first that is sure
wins; when none is, the first reading stays. That test has to be strict: a card upside down or sideways reads made-up
numbers and chance names ("Seel" out of the noise), and a lenient one opened 4 wrong cards. On a photo that was turned,
only a name read exactly counts, not one a letter off ("Wo-Chien" from the bottom of an upside-down Chansey), and a
first reading with an exact known name of 7 letters or more is kept when the photo was not turned (`KEEP_NAME_LETTERS`).
The second chances are the photo turned a quarter each way (the way that worked last first, `lastWorkingTurns`: a phone
loses which way is up the same way every time; skipped when turning finds no clearly bigger card, `MIN_TURN_GAIN`),
and then the card cut out straight. They are read "quick" (`readSeenPhoto(..., quick)`): the number places and the name
strip only, and the rest of the reading is skipped when neither is sure. A card lying sideways is also turned at the
first look (`lookAtPhoto`), as Magic cards are since 1.57.0: found upright only a part of it has a card's shape, and a
card found turned that is 1.5 times as big (`MUCH_BIGGER_WHEN_TURNED`; 1.15 times when the upright box is under 55% of
the photo's height, `UPRIGHT_ENOUGH`) is taken. Both ways of turning a sideways card find a box of the same size, so
within 5% (`SAME_SIZE`) the way that worked last wins. Japanese photos use the same `lookAtPhoto` with `turnEagerly`,
which also turns when no card is found upright.

A card at an angle: `findSlantedCards` (`card-finder.js`) finds four slanted sides as lines - a Hough vote on the edge
map's signed gradient, leans up to 12 degrees, so a faint edge adds up along its whole length - and scores each side by
its contrast a few pixels either side (thin print lines score low), the quiet of the card's border, and the shape of a
card (0.72 wide to high); the card beats the frame inside it. `flattenedPicture` stretches the best boxes flat, a
perspective stretch (`flatToPicture` maps back), 1.5% larger than the lines say. `worthStraightening` decides when: no
clear box was found, or a slanted box overlaps the found one and a corner is 3% of the card's height or more away from it.
Tested with `dev_real_photos_test.html?turn=1` and `?turn=3` (each photo turned a quarter), and `?tilt=0.12&zoom=0.8`
and `?tilt=0.06&zoom=0.85` (as if from below at an angle; `lean`, `contrast`, `blur` and `side` also exist), the right
card first / opened by itself right, 1.65.0 and now: turned clockwise 0 / 0 and 45 / 44, counter-clockwise 0 / 0 and
43 / 41, at 12% 22 / 20 and 28 / 26, at 6% 32 / 30 and 34 / 32. None of the turned photos is opened wrong now; at an angle
3 (12%) and 1 (6%) are, in 1.65.0 and now alike (roadmap 1.14). The upright photos, special numbers, full-art, learning, Japanese and Magic tests are as before. Still
not read: `dev-local/alakazam.jpg` (1200 x 1600 pixels, its name pale on silver: roadmap 1.16), a binder page's
neighbours (1.15).

**The app's own camera.** "Take photo" opens a live camera inside the page (`camera.js`), zoomed
2x and with the phone's light on, because the phone's own camera screen can't be told to do either.
Zoomed in, the phone is held further away, so the card is in focus and out of the phone's shadow; the
light stays on, so a glare spot shows before the photo is taken. Zoom needs iOS 17 or Chrome on
Android, the light iOS 18; the buttons for them only show when the phone can. Both are remembered.
With "Auto" on (the button at the top left; on by itself in kids mode until switched either way),
the camera takes the photo by itself: a few times a second it looks around the white frame in a
small copy of the live picture for a card-shaped box with edges all round (`lookForCard`,
`findCardShapesInFrame` in `card-finder.js` - gentler than the finders used on the photo, as those
check it properly afterwards), and once the card fills the frame and the box nearest where it was
has stayed put for about a second (`nearestBox`, `STILL_MOVE`), it presses the shutter (`watchForCard` in
`app.js`). A hand that never gets quite still gets its photo after 3 seconds anyway. After "Save
and scan the next" it first waits for the frame to be without a card for two looks in a row, so the
card just saved isn't taken again.
Where the browser can (Safari 18.4, Chrome), the photo is the camera's own full-size photo, otherwise
the live picture (an iPhone gives 2160×3840). The reader is told where the white frame was
(`readCardPhoto`'s `frame`): the card's own edges are used when found close to it, and the frame
otherwise; and when the number reads aren't sure, the number is read again at the frame's place. A live picture is softer than a photo, and a slightly
soft picture hides the tiny numbers on old cards from the reader, so: the white frame covers 90% of
the camera's real picture (the screen shows the whole of it), the sharpest of six pictures in the
0.6 s after the press is kept (pressing shakes the phone), and a picture that measures soft
(`softnessOf`) is sharpened, by an amount scaled to its size. Sharp pictures are left alone:
sharpening them made numbers read worse. On 10 old cards, sharp and slightly soft pictures (4K and
1080p) read 9 or 10 numbers, as many as the phone's own photos. With `?camera` in the address,
the bottom of the page then says what the camera gave ("camera 2160×3840 (live picture) · soft
(0.18), sharpened"), to find out what a phone does (`SHOWS_CAMERA_DETAILS`; shown to everyone
until 1.41.2). The same line says what the phone remembers about "Auto" and whether it can save at all
(`storageDetails`, from 1.62.0: `cameraAuto=on (in use: on), storage ok`). "Use the phone's own camera" at the bottom opens the old camera screen, and so does
the button when the page can't have a live camera.

**Which back camera** (version 1.68.0, `openMainBackCamera` in `camera.js`). A phone with several back cameras has
its light by the main one, and the browser may give a page another: on a friend's Samsung phone in Chrome the live
picture had no light button and was grainy and blurry, where the phone's own camera was sharp - likely the wide-angle
camera, which on many phones can't focus close up. So when the camera the browser gives has no light, and the browser
can switch a light on at all (`getSupportedConstraints().torch`; not Safari before iOS 18), the other back cameras
(`enumerateDevices`, facing back) are opened one at a time - a phone may have only one open - and the first with a light
is used. What was found is remembered on the phone (`kortpris.cameraLens`), so the looking is done once; a remembered
camera that has gone is looked for again. An iPhone's first back camera has the light, and a computer's webcam faces no
way, so neither looks. With `?camera` the bottom of the page names the camera ("lens camera2 0, facing back (with
light) · 1 other back cameras tried"). Checked with made-up cameras in a browser (scratchpad `lens_checks.js`, 14
checks); not yet on the Samsung itself.

**Live scanning for Magic cards** (version 1.72.0, `watchLive` in `app.js`, `grabLiveFrame` in `camera.js`; **switched off
for everyone since 1.72.1**, a friend found the camera much worse: `?live` in the address offers it again on that phone and
the phone remembers it, `?live=0` takes it away, see `liveScanningOffered` in `camera.js`; the rest of this paragraph is how
it works when it is on). With Magic
picked (not in kids mode), the app's camera stays open and reads one card after another, as Manabox and Delver Lens do. It
looks at the live picture four times a second, as "Auto" does (`lookForCard`, `nearestBox`); once a card-shaped box has
stayed put for two looks (`LIVE_STILL_LOOKS`, half a second; after 2 s anyway), the live picture is grabbed at once
(`grabLiveFrame`: no waiting for the sharpest of six, no full-size photo, sharpened when soft as before) and read the way
a photo is (`scanPhoto`, with `hooks.onName` so `readMagicPhoto` can say the name as soon as it is read sure, before the
corners). The camera stays open under a strip (`#camera-result`) with the name at once, then the set, number and price
(`showLiveResult`), a **Save** button (once for each card read: `liveLast`), a count, and a tap to open the card's page.
The card page is drawn behind the camera as ever, so closing the camera shows the last card. While a card is read
(a second or more), the frame goes on being looked at (`watchForChange`), so a card swapped meanwhile isn't taken for the
one read. A card read stays read while it is in the frame, nudged by a hand or not; it counts as another once the frame
has been empty for a look, or it has moved a quarter of its size (`LIVE_NEW_CARD_MOVE`) - a tiny picture of what is in
the frame couldn't tell two cards apart (the same card moved 4% differed as much as two different cards).
Nothing read is tried once more (`LIVE_MOST_TRIES`), then "Couldn't read it"; a list of prints isn't read again, as an old card with
no number gives the same list. The round button reads the frame now, card-shaped or not. The ⚡ Live button
(`kortpris.cameraLive`) switches it off, which gives the photo-taking of before, with "Auto" shown in its place again.
The first card is read sooner as the text reader and Scryfall's list of names start when the camera opens
(`readyMagicReader`). It needs a table the card's edges show against: the frame only sees a card-shaped box. Checked with
a made-up camera in a browser (scratchpad `live_checks.js`: the cards of the Magic photos slide into the frame one after
another - every other one with the frame empty between - 18 checks; 19 of 32 opened right, none wrong, against 22 read
from their files; 2.2 s from the card sitting still to its strip, in the middle, on the PC); not yet on a phone. With
`?camera` the bottom of the page says how long the last live read took.

**Learning.** When the app can't tell which card a photo shows (or opens the wrong one) and the
viewer taps or types the right one, or saves the card the photo found, the app remembers how that
card's artwork looked in the photo (`learned.js`): the same small colour thumbnail the picture
comparison uses, about 1,300 bytes, kept on the phone and, while someone is signed in, in their
account too (`learned/<username>` in Firestore), so it follows them to every phone and isn't lost
when the phone's browser forgets it. A search typed while the photo's card
is already known is taken as a price lookup of some other card, and teaches nothing
(`answersPhoto` in `app.js`). Every new photo is compared with those first: as soon as the card's
edges are found in it, before any text is read (`lookAtPhoto` in `reader.js`, `openLearnedEarly` in
`app.js`). When it looks just like one learned card (`SAME_CARD_DISTANCE`) and clearly unlike every
other (`SAME_CARD_GAP`), that card opens straight away - in about a second, instead of after the 5
to 20 seconds of reading - however badly the text will read. The text is still read, as a check:
when it names another card's name and number exactly, that card is shown instead, because the same
picture is printed in several sets (`checkLearnedCard`). A photo whose card's edges aren't found is
compared by where its text is, after the reading. A reading stops between its steps when another
photo comes, so photos taken quickly one after another don't queue up. A photo that only looks
somewhat like learned cards (`LIKE_CARD_DISTANCE`, in other light or of another copy of the card)
still gets them as suggestions: they join the cards its text found, and when nothing is clear they go
first, marked "Seen before" - but they never open by themselves. When nothing could be read, they
are shown on their own to pick from. Tapping one teaches the app that photo too, so the next one
like it opens straight away. "Cards the app has learned" on the Scan screen lists them, each with a
Forget button. Tested with `dev_learning_test.html`.

**Kids mode.** The 🧒 button at the top switches on a mode for children who can't read well
yet: one big picture to tap for the camera, the card with 1 to 5 Poké Balls for how valuable
it is (one Poké Ball, then two Premier, three Great, four Ultra and five Master Balls, from 20, 40, 250 and 520 kroner), one rounded price, versions as little pictures of where the card glitters, and a big
Save button. Two big buttons at the top pick the game, a Poké Ball for Pokémon and a gem for Magic
(1.56.0). For Magic cards a big name box and Search button sit below the camera picture: an old card's
fancy letters can be too much for the reader, and a child can type the name instead. A Pokémon card's name
and number boxes show once the app didn't get the card (version 1.71.0, `showKidTyping`, body class
`kid-typing`): when a photo's card isn't found (🤔 "Couldn't find the card. Try a new photo, or write its
name.") or only a list to pick from is shown ("Not there? Write its name."), and on the card's page a big
"✏️ Not your card? Write it" button shows them for a card taken wrongly, with the name read selected to write
over (status `typeCardName`, said out loud). A new photo hides them again. A Magic card shows 1 to 5 gems instead of balls, at the same prices: they
climb like the colours of a Magic card's rarity symbol, one black (common), two silver (uncommon),
three gold (rare), four orange (mythic rare), and five rainbow gems like a shiny foil card
(`gemsHtml`). Magic's own mana and planeswalker symbols are left alone: Wizards of the Coast's Fan
Content Policy doesn't allow them in fan apps. Other typing, settings, price tables and accounts are
hidden (sign a child in first,
in normal mode; a kid's account switches kids mode on by itself, see Kids' accounts). The phone also says everything out loud in Danish or English ("Pikachu. It's
worth about 33 kroner."), with its own built-in voice (`speech.js`): free, and nothing is sent
anywhere. The 🔊 buttons read aloud in normal mode too. iPhones only let a page speak after a
tap, so the first words come from pressing the camera button.

**Accounts.** Each person can have a username and password, and their My cards is then kept
online and shows up on every phone they sign in on. Passwords must be at least 10
characters and pass the [zxcvbn](https://github.com/dropbox/zxcvbn) guessability check.
Accounts run on a Firebase project the owner creates: see [SETUP-ACCOUNTS.md](SETUP-ACCOUNTS.md).
Until `firebase-config.js` has that project's settings, the app hides accounts.
Firebase keeps a copy of the account's cards on the phone (version 1.48.0, `phoneCopy` in
`account.js`), so My cards shows them without internet too, and changes made meanwhile are sent
when the phone is online again. (Changed offline on two phones at once, the last one to come online
wins: the list is saved as a whole.)

**Kids' accounts.** A parent makes an account for each kid from their own (My cards → Kids'
accounts, version 1.48.0; `addKidAccount` in `account.js`), with an easy password of three words and
a number if they like. Signed in on the kid's phone, it opens in kids mode, with only the kid's
cards - each time the app opens, at once (the phone remembers the kid's account: `kortpris.kidAccount`),
and each time the kid signs in. The kid can still turn kids mode off with 🧒 for the full app; it
then stays off until the app is next opened, whatever Firebase sends meanwhile. The parent's My cards gets a button for each kid, shows and saves to that kid's cards when
picked, and a saved card's page gets "Move to" (one, or all of them). The kid's account names its
parent once, as it is made, and the parent's account lists its kids; `firestore.rules` lets a
parent at a kid's cards only when both agree, and never at the kid's Claude key or learned cards.
Firebase signs in whoever an account is made for, so a kid's account is made in a second, hidden
copy of Firebase on the phone, and the parent stays signed in. The kids' passwords are kept in the
parent's account (version 1.49.0, `kidPasswords/<username>`, only the parent can read it), so
"Show password" looks one up when a kid forgets: Firebase keeps the passwords themselves scrambled,
where nobody can read them back. "Delete" deletes a kid's account for good (version 1.50.0,
`deleteKidAccount`): Firebase only lets an account delete itself, so the hidden copy of Firebase signs
in as the kid with the kept password, deletes its cards, learned cards and settings and then the
account, and the parent's app takes away the kid's link (which only the parent may) and its place in
the list. Before anything is deleted, both the rules and the password are checked.

**Optional: read cards with Claude.** Only for someone signed in to an account: then, under
"Read cards with Claude" on the Scan screen, they can save their own Anthropic API key.
Each account has its own key, kept in the account since version 1.48.0 (`settings/<username>`,
readable only by that account), so it works on every phone the account signs in on and nobody
else signing in gets it; signed out, the box is hidden. (Before the Firebase rules of 1.48.0 are
published, the key stays on each phone, `kortpris.claudeKey.<username>`, and moves into the account
once they are.) Photos are then read by Claude Opus 5
(`claude.js`), which handles worn, foil and non-English cards far better, at roughly
US$0.03 per photo on the key owner's account. If Claude fails, the built-in reader takes
over and a notice says why. The key is sent only to Anthropic.

**On the home screen.** The app can be installed like an app. "Install app" at the top of the
page opens a guide for each kind of device - iPhone and iPad, Android, Chromebook, computers,
Firefox and other browsers - with the device in hand marked and first, and a one-tap Install
button where the browser offers it. Installed, it opens full screen, with its own icon
(`manifest.webmanifest`, the icons from `dev_make_icons.py`). A service worker (`sw.js`) keeps the
app's own files, the text reader, Firebase's files, the fonts and the newest 1,500 card pictures on
the phone, so the app starts at once and opens without internet; My cards then shows the cards
saved on the phone, with their pictures. The card database's answers are kept on the phone for a
day as well (version 1.43.0, `askTcgdex` in `cards.js`, in a cache of their own): scanning a card
again, or opening a saved card, asks the database nothing, and a card scanned earlier that day
opens even without internet. "Update prices" in My cards still asks for today's prices. (A card
from a set TCGdex adds that day can be missing from a search kept from earlier the same day.) The
start page is still asked for from the internet each
time (within 3 seconds, or the copy kept is used), so an update arrives the first time the app
opens, and the older version's files are thrown away. On an iPhone, the home screen app keeps its
own saved things, apart from Safari's: My cards and the learned cards start empty there until
someone signs in, which the app says. Signed-in accounts show their cards without internet too,
from Firebase's copy on the phone (see Accounts).
While developing on this PC (localhost) the service worker is off, because files change there
without a new version number; `?sw` in the address switches it on to test it, and opening the page
without `?sw` takes it away again (but not the database's answers kept).

What comes next, and why: [ROADMAP.md](ROADMAP.md).

## Files

| File | What it does |
|---|---|
| `index.html` | The page layout |
| `style.css` | Colours, fonts, spacing |
| `strings.js` | Every text in English and Danish - edit wordings here |
| `speech.js` | Reads text aloud with the phone's own voice, picking its most natural one |
| `pokemon-names.js` | All Pokémon names, used to correct misreads |
| `card-names.js` | All Trainer and Energy card names, used the same way |
| `card-finder.js` | Finds where the card is in the photo (yellow border, shape, or slanted edges), and cuts a slanted card out flat |
| `set-codes.js` | The set codes printed on cards since 2023 ("PAF"), with their sets and sizes |
| `reader.js` | Photo → name and number |
| `cards.js` | Searches the card database (TCGdex), asks for the prices of the cards shown, and keeps its answers for a day |
| `card-ids.js` | The old database's set ids and TCGdex's, and the 30th Celebration reprints' numbers |
| `magic.js` | Magic: The Gathering cards and their prices from Scryfall, found by name, set code and number |
| `magic-reader.js` | Photo → a Magic card: its name, and the set code and number in its corner |
| `magic-sets.js` | Every Magic set's code and size, to tell a set code read from a misread one |
| `japanese.js` | Japanese Pokémon cards and their prices from TCGdex's Japanese database, found by name and number |
| `japanese-sets.js` | The Japanese sets: when each came out, and where Scrydex keeps its pictures |
| `japanese-reader.js` | Photo → a Japanese card: its number, and the set's code in its corner |
| `matcher.js` | Sorts candidate cards by how much they look like the photo |
| `collection.js` | "My cards": saved cards, how many of each, total value |
| `claude.js` | Optional: Claude reads the card instead, with the viewer's own API key |
| `sparkle.js` | Tells a reverse holo from the photo: glitter everywhere except the picture |
| `camera.js` | The app's own camera: the back camera with the light, live picture, 2x zoom, light, and the photo |
| `learned.js` | Remembers cards the viewer picked for a photo, and recognises the next photo of them |
| `graded.js` | PSA prices of a card, asked from the relay and kept on the phone for a day |
| `relay/` | The PSA price relay that runs on Cloudflare, not in the page |
| `storage.js` | Saves things on the phone (language, My cards) |
| `currency.js` | Shows prices in DKK, EUR, GBP or IDR, with the central bank's daily rates |
| `account.js` | Accounts: sign up, sign in, and My cards kept online (Firebase) |
| `password.js` | Decides whether a new password is strong enough |
| `firebase-config.js` | Which Firebase project holds the accounts |
| `firestore.rules` | Firebase-side privacy rules: each account sees only its own cards (and a parent their kids') |
| `firebase.json` | Settings for Firebase's command-line tools and local test copy |
| `SETUP-ACCOUNTS.md` | Click-steps for creating the Firebase project |
| `app.js` | The screen: buttons, results, prices |
| `sw.js` | The service worker: keeps the app's files and card pictures on the phone |
| `manifest.webmanifest` | The app's name, icon and full-screen look on the home screen |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | The home screen icons, drawn by `dev_make_icons.py` |
| `dev_make_icons.py` | Development tool: draws the icons (`python dev_make_icons.py`) |
| `dev_reading_test.html` | Development tool, not part of the app (see below) |
| `dev_real_photos_test.html` | Development tool: runs real photos from the private `dev-local/` folder |
| `dev_learning_test.html` | Development tool: checks that learned cards are recognised or suggested, and nothing else is opened |
| `dev_special_numbers_test.html` | Development tool: promos, gallery and other lettered numbers (see below) |
| `dev_fullart_test.html` | Development tool: full-art, gold and illustration-rare cards (see below) |
| `dev_magic_photos_test.html` | Development tool: runs real photos of Magic cards from the private `dev-local/` folder |
| `dev_japanese_test.html` | Development tool: fake photos of 80 Japanese cards made from their pictures, and real ones from `dev-local/`; `?pokemon=1` scans them with Pokémon picked |

## Publishing a change

Every push to `main` goes live within a minute or two. Before pushing, raise the version
number `?v=...` on our own files in `index.html` (and in the five `dev_` test pages), for example:

```bash
sed -i 's/?v=1.10.0/?v=1.10.1/g' index.html dev_reading_test.html dev_real_photos_test.html dev_learning_test.html dev_special_numbers_test.html dev_fullart_test.html
```

The page shows that number at the bottom ("Kortpris version 1.10.0"), so it's easy to check which
version a phone has. It also makes browsers fetch a matching set of files, instead of mixing
new ones with old cached copies, which could break the app for up to ten minutes. A phone may
still keep the start page itself for up to ten minutes (GitHub Pages) and open the version from
before an update, so the app asks for the newest start page as it opens, and loads again, once,
when that names another version (`reloadIfNewerVersion` in `app.js`). Since 1.36.0 the service
worker (`sw.js`) asks for the newest start page itself, and keeps each version's files by their
`?v=` address - which is why the version must go up with every change. `sw.js` itself has no
version number and doesn't need one.

## Run it on the computer

```bash
python -m http.server 8765 --directory "D:/Claude - Card Scanner"
```

Then open <http://localhost:8765>. Opening the file directly (double-click) does not
work, because the text reader needs to be served by a web server.

## Testing accounts without a real project

Firebase's local test copy runs on this computer with fake accounts that never go online.
It needs Java 21 and the Firebase command-line tools:

```bash
firebase emulators:start --project demo-kortpris --only auth,firestore
```

Then open <http://localhost:8765/?emulator>. The `?emulator` part makes the app talk to the
local copy instead of the real project.

## Measuring the reader

Open <http://localhost:8765/dev_reading_test.html>. It makes 16 fake phone photos of 8
real cards (tilted, badly lit, blurred), runs them through the app and scores the result.
The photos are the same every run, so run it before and after changing `reader.js` or
`matcher.js`.

Real photos matter more. Put them in `dev-local/` (never published) and list them, with the
right answers, in `dev-local/real-photos.json`; then open
<http://localhost:8765/dev_real_photos_test.html>. Use the phone's original files: photos
sent through a chat app are shrunk to half the size or less on the way. `?only=IMG_2022` runs
just some of them, and `?list=cut-photos` reads another list, `dev-local/cut-photos.json`, the
same way. `?turn=1` (or 3) turns every photo a quarter turn first, as a messenger can, and
`?tilt=0.12&zoom=0.8` shows each photo as if from below at an angle (also `lean`, `contrast`, `blur`
and `side`; the top edge is shortened by `tilt`, a share of the width), so the reader has to find the
card turned or slanted; `?straighten=1` reads each photo cut out straight first. Each row says whether
the reading was "sure" of the way up.

The number scores in the fake-photo test are pessimistic: the fakes are made from 1024-pixel card
pictures, so their tiny print has far less detail than a real phone photo.

<http://localhost:8765/dev_special_numbers_test.html> does the same for 27 cards with unusual
numbers: Black Star promos, Galarian and Trainer Gallery, Shiny Vault, Radiant Collection and the
Aquapolis/Skyridge holos. `?only=svp,GG` runs just some of them.
<http://localhost:8765/dev_fullart_test.html> does it for 27 full-art, gold, rainbow and
illustration-rare cards, whose name and number are printed on the artwork.

## Things to know

- **TCGdex gives prices one card at a time**, so a search finds cards without them, and the app
  asks for the prices of a card as it opens (`withPrices`). Its Cardmarket and TCGplayer prices are
  from the same day.
- **Some cards have no picture in TCGdex** (1,621 in September 2026: the Galarian Gallery, the
  Shiny Vaults, the Trainer Galleries, trainer kits, McDonald's cards, the newest promos): those
  borrow Scrydex's (version 1.44.0, `scrydexIdOf` in `card-ids.js`), which knows cards by the old
  database's ids and has 1,552 of them. The other 69 (the Unown Collection, My First Battle,
  Yellow A Alternate, one Terapagos promo) show a grey "?", and can still be found by their
  number. Scrydex answers a card it hasn't with a picture of a card's back, so its ids were
  checked against its own set lists; the few it numbers differently are listed in
  `SCRYDEX_CARD_IDS`. Scrydex's terms forbid copying its pictures, so they are only shown, one at a
  time, like any picture on a web page. Cards saved or learned with the old database's picture get
  Scrydex's once (`moveSavedPicturesToScrydex`).
- **TCGdex's picture server refuses pictures whose address has an ending** like `?readable`
  (it then sends its permission twice), so its addresses are used as they are (`readablePictureUrl`).
- **The old database, pokemontcg.io, is being shut down** (its keys stop working on 1 March 2027)
  and allowed 1,000 lookups a day per internet connection without a key. The test pages make their
  fake photos from its big pictures, so they stay the same photos as before the move (see
  ROADMAP.md, 5.3).
- **Prices are for ungraded cards.** Condition changes the value a lot.
- [Scrydex](https://scrydex.com), from the old database's makers, is a paid alternative.
