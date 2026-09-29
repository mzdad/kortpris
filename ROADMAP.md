# Kortpris roadmap

What to build next, and why. Started 26 September 2026 at version 1.25.0, and kept up to date:
finished items move to "Done" with their version, and keep their number. Biggest wins first
within each part; the size is a rough guess of the work (S = an hour or two, M = a session,
L = several sessions).

## Done in 1.58.0

- **7.7 Faint names on old white Magic cards, in part** (you said: "start with 7.7"). The names of Ice
  Age, Mirage and Urza's Legacy cards are letters embossed on the frame: light letters with a shadow, on
  a textured bar. The reader now has two more ways to read a name, tried last, so only a card whose name
  isn't found yet pays for them: the light print cut hard (black and white) from a strip cut close around
  the name, and "sparse text" (Tesseract's mode for letters scattered over a picture) in the dark print.
  - Your photos: Femeref Knight, Radiant, Archangel and one of the two foil Geist of Saint Traft photos now read. Names read
    28 of 32 (25), the right card first 24 (21), opened by itself 15 (13) - all right, none wrong - at
    1.3 seconds a photo. In the test browser, Femeref Knight opened as Mirage 18 and Radiant, Archangel as
    Urza's Legacy 20, from the app's "Choose photo".
  - Found by measuring, first: 90 ways of reading on the five hardest photos (three strips, two sizes,
    five ways of taking the ink, three Tesseract modes), then 288 on the two that stayed unread. The
    plain ways read almost none of these names; each new way reads some that no other does. The wider
    strip, cut hard, read "Radiant, Archangel" too, but at confidence 0, and the rule that faint words
    don't count (1.57.0) still throws that out: the close strip reads it at 78, so it counts.
  - Still unread: **Kismet** and **Kjeldoran Knight**. The best reading of Kjeldoran Knight, in any of
    about 400 ways, got about half its letters; Kismet's exact reads were noise the reader itself rated 0.
    Their cards are only about 700 pixels wide in these photos (they came through Signal), so the app's
    own camera, which gives several times that, may read them: worth trying.
  - Not touched: a name read only at confidence 0 still doesn't count; the frame's word "TRAINER" on
    Pokémon Trainer cards read as "Train Troops" in the sparse-text way, when a Pokémon photo is read as
    a Magic card (see 7.8).

## Done in 1.57.0

- **7.2 Magic cards from a photo, and learned Magic cards** (you put 32 photos of your Magic cards in
  `dev-local/` and said: "i PUT IN ALOT OF MAGIC PICTURES IN THE FOLDER LEARN FROM THEM").
  - With Magic picked, "Take photo" and "Choose photo" read Magic cards: the name along the top, and on
    cards from 2014 on the number and set code in the bottom-left corner ("246/297 R" over "SOI • EN"),
    which name the one printing. Older cards are told apart by their picture, as Pokémon cards are.
  - Cards photographed sideways are turned the right way up (16 of your 32 photos were), and upside
    down ones too.
  - The names come from Scryfall's list of all 36,000 Magic cards. A name may have one misread letter in
    four, or lose its end; but words read only faintly count only when they spell a long name exactly:
    a bit of the frame is easily read as "Fear" or "Pain", which are cards too.
  - A misread set code is made a real set's of the size read ("SOT" is SOI, 297 cards): a new list of
    every set's code and size, `magic-sets.js`.
  - A card opens by itself only when its corner named it, or its picture looks like the photo;
    otherwise the printings are listed, closest look first, to tap. The German, French and Italian
    black-bordered printings of 1994-95 are left out, as an English name was read.
  - Learned Magic cards: tap the right card in the list, and the next photo of it opens at once
    ("Recognised: you've shown me this card before"), as for Pokémon cards.
  - Kids mode: the big photo button is back for Magic, with the name box below it, as an old card's
    fancy letters can be too much for the reader.
  - Tested: a new test page, `dev_magic_photos_test.html`, on your 32 photos (29 cards from 1994 to
    2018, 16 sideways, 4 foils): turned right 32, names read 25, numbers read 10 of the 17 that print
    one, the right card first 21, opened by itself 13 - all right, none wrong - in 1.5 seconds a photo.
    In the test browser: the sideways Angrath opened with "RIX 152" filled in; Sengir Vampire listed its
    printings, and once Fourth Edition was tapped, the same photo opened it at once; in kids mode, Reflect
    Damage was read aloud with its gem. Your 46 Pokémon photos read exactly as before: 46 first, 45
    opened by themselves, 0 wrong, 25 by the number alone.
  - Not yet (new rows 7.5 to 7.7, and 1.12): telling a foil from its normal copy, printings with the same
    picture (Summer Magic, Fourth Edition), faint names on old white cards (4 of your photos), and
    sideways Pokémon cards.

## Done in 1.56.0

- **7.3 Kids mode and sales links for Magic** (you asked: "Please do 7.3 and what could be a good
  idea insted of pokeballs? i dont play magic, but is there something like pokeball but in magic ?").
  - Kids mode has two big buttons at the top: **Pokémon**, with a Poké Ball, and **Magic**, with a
    gem. The phone remembers the choice. For Magic, a big name box and Search button take the big
    camera picture's place, and the phone says "Write the card's name. It's at the top of the card."
    The photo buttons say, out loud too, that Magic cards can't be read from a photo yet.
  - A Magic card's value is **1 to 5 gems** instead of Poké Balls, at the same prices (20, 40, 250
    and 520 kroner). They climb like the colour of the rarity symbol on a Magic card: one black gem
    (common), two silver (uncommon), three gold (rare), four orange (mythic rare), then five
    rainbow gems, like a shiny foil card. My cards shows gems for Magic cards and balls for Pokémon
    cards. Magic's own famous symbols - the five mana symbols and the planeswalker symbol - can't be
    used: Wizards of the Coast's Fan Content Policy lists them among what fan apps may not use. The
    gems are the app's own drawing.
  - A Magic card's page has the **"Graded cards (PSA)"** links to its sales on PriceCharting, like a
    Pokémon card's, and a card without prices links to its ungraded sales. The search is the card's
    name, "Magic" and its set as PriceCharting names it (29 sets have other names there, like "M11"
    for Magic 2011), with "Foil" for a foil copy. For a normal copy, PriceCharting's special editions
    are left out. The PSA price table stays Pokémon only: its price service knows Pokémon cards only.
  - Learned Magic cards moved to 7.2: the app learns a card from a photo it read wrong, so it needs
    Magic cards read from photos first.
  - Tested: PriceCharting's search with 51 Magic cards, old and new, in five ways, 2 seconds apart.
    The best way, now in the app, opened a normal copy's own page straight away for 41 and put it
    in the first three for 8 more. The other 2 were further down: Wrath of God from 5th and 10th
    Edition, which PriceCharting doesn't seem to have. Foil copies: 15 of 31 opened straight away,
    and 10 more were in the first three. Five promo and special-set searches: 3 opened straight
    away, and 2 were promos PriceCharting doesn't have. Also 116 checks of the links (Pokémon links unchanged),
    170 checks of kids mode's texts and gems in both languages, and the 36 Magic search and 17 My
    cards checks from 1.55.0 still pass. In the test browser: kids mode's buttons; typing Lightning
    Bolt M11 149 (a black gem, and two silver ones for the foil); saving it; My cards with gems and
    balls side by side; the photo button's message; a name that doesn't exist; switching back to
    Pokémon; reopening the app on Magic; and the grown-up card page's links for Lightning Bolt and
    Black Lotus. All in English and Danish, light and dark, at phone width.

## Done in 1.55.0

- **7.1 Magic: The Gathering cards: search and prices** (you asked: "Is it possible to add Magic the
  gathering cards aswell? So we make this app multiuse?", then "YEs start with 1").
  - A **Pokémon | Magic** switch above the search, remembered on the phone. For Magic, type the
    card's name - a misspelt one is corrected ("Lightnig Bolt") - and if you like the set code and
    number from the card's bottom-left corner ("M11 149"), which find the one printing at once.
  - Every printing is listed with its picture, newest first (Lightning Bolt has 61 you can hold).
    Cards not out yet, and those only played online, are left out. When there are more than 24, a
    note says to add the set code and number.
  - A card's page shows its versions - normal, foil and etched foil - each with Cardmarket's price
    in euros and TCGplayer's in dollars, in kroner too, and links to both shops.
  - Saved Magic cards have a "Magic cards" group in My cards, count in the total, are kept in your
    accounts like any card, and "Update prices" updates them from Scryfall.
  - Not yet (7.2 and 7.3; 7.3 came in 1.56.0, above): reading Magic cards from a photo - the photo buttons say so - kids mode's
    own look for Magic, PSA prices and sales links, and learned Magic cards. Kids mode hides the
    switch and scans Pokémon cards; a saved Magic card shows in a kid's list with Poké Balls.
  - The page's foot says the Magic cards come from Scryfall, with the notice Wizards of the Coast
    asks fan apps for.
  - Tested: 36 checks of the Magic search with a pretend Scryfall (misspelt names, set codes like
    "10E", cards not out yet, refusals, saved cards 75 at a time), 17 checks of My cards with both
    games, and in the test browser against the real Scryfall - the search, the card page, saving, My
    cards, opening a saved card and "Update prices" - in English and Danish, at phone width and in
    kids mode. Scryfall was asked one question at a time, about 0.7 seconds apart. Your 46 real
    photos read exactly as before: 46 first, 45 opened by themselves, 0 wrong, 25 by the number alone.

## Done in 1.54.0

- **PSA sales without an eBay account** (you asked: "Is there a way we can in a free get around the
  account creating for checking the psa prices on ebay?. I dont want my kids to have a Ebay account
  just yet", then "Yes swich them"). Since the summer of 2026, eBay shows its sold listings only to
  people signed in to eBay, so the app's sales links ended on eBay's sign-in page. They now go to
  PriceCharting, which lists the same eBay sales - the day, the listing's title and the price - for
  free and without an account. The PSA price table itself is unchanged: it never needed an account.
  - Each grade's "See" link opens the card's sales in that grade. When PriceCharting knows only that
    one card, it opens straight on the list; when it knows several versions (for example a normal
    card, a Prize Pack one and a Jumbo), it lists them to pick from first.
  - From 9.5 down, PriceCharting keeps the companies in one list (PSA 9 and CGC 9 together), and each
    sale's title says which; a half grade like CGC 8.5 is among the 8s.
  - PriceCharting names some sets its own way, so the app asks for them that way: every promo is
    "Promo", galleries and shiny vaults belong to their set, and Expedition, the anniversary sets and
    McDonald's cards have PriceCharting's names.
  - The menu under the PSA table is now called "Last sales and other companies"; without prices it
    is "See sales on PriceCharting".
  - Tried on 104 cards - the 40 cards in your photos, 27 full-arts, 27 special numbers and 10 more:
    61 open straight on the card's sales, 36 show the card first in a short list, and 7 second or
    third. With the database's own set names, 16 had been 4th to 33rd in the list.

## Done in 1.53.0

- **The whole code checked, and 8 mistakes fixed** (you asked: "Check the code from start to end for
  errors", then "fix them please"). Every file was read, and the texts in both languages, the syntax
  of every file and the Claude settings were checked by machine too: those were all right.
  - **"Update prices" could erase a list of cards.** Picking a kid's cards, or signing in, while the
    prices were still being updated saved an empty list over that account's cards - when its cards
    hadn't arrived yet, as on the first time on a phone. Now a list is never saved before its cards
    have arrived, and the update stops when another list is shown. Tried on the test copy: a parent
    with 40 cards and a kid with 3, the kid picked during the update with Firebase cut off - the
    kid's 3 cards were still there. A simulation of 1.52.0's code in the same case saved an empty
    list over the kid's cards.
  - **Moving the phone's cards into the account mixed up versions**: a reverse holo saved on the
    phone was added to the normal print of the same card in the account. Now each version stays its
    own.
  - **The app's camera kept a big picture (about 33 MB) after each photo** on phones that give the
    camera's full photo (Chrome on Android, newer iPhones), until the phone cleared it; after many
    quick photos in a row, the phone could refuse to draw more. Now it is let go of at once.
  - **Nidoran and Porygon were never known by their names**: Nidoran♀ and Nidoran♂, and Porygon and
    Porygon2, have the same letters, and counted as a tie. Now the name read is "Nidoran" or
    "Porygon", and the search finds them all, the number deciding which.
  - **The PSA price relay answered anyone** whose request didn't say which site it came from, so
    another web page could use up the day's 50 PSA lookups. Now only the app is answered (the relay
    was updated on Cloudflare; checked: the app's questions are answered, others refused).
  - Smaller: a reading that failed kept the full-size photo (about 48 MB) until the phone cleared it;
    a learned anniversary reprint was listed as "69/null"; and when the first question about the
    PSA lookups left failed, it wasn't asked again until the app was opened again.
  - Your 46 real photos read exactly as before: 46 first, 45 opened by themselves, 0 wrong, 25 by the
    number alone.

## Done in 1.52.0

- **Kids mode first on a kid's account, and a way out** (you asked: "the kids mode should always be
  the main activated one. Also should be able to turn it off if they want, so they can use the full
  version of the app"). A kid's account now opens in kids mode every time the app is opened, and
  every time the kid signs in - from the first moment, as the phone remembers it is a kid's account,
  where before the full app could show until Firebase answered. The kid can tap 🧒 to turn it off and
  use the full app; it stays off until the app is next opened.
  - Fixed on the way: kids mode was switched on again each time Firebase sent news of the account -
    for example when the phone came back online - so a kid who had turned it off was put back in it
    at any moment.
  - Your own account works as before: kids mode stays as you leave it.
  - Tried on the test copy with a made-up parent and kid: signed in as the kid, kids mode on; turned
    off, then Firebase cut off and back, still off (the old way turned it back on - checked too);
    the app reopened, kids mode on at once, before Firebase; signed out and in as the parent, not
    forced, and the parent's own choice kept through a reopen; the kid signed in again, kids mode on.
  - "Opened again" means really opened: a phone may keep the app running in the background for a
    long time, and then it stays as the kid left it.

## Done in 1.51.0

- **1.11 Numbers on sparkly foil** (you said: "do 1.11"). Your Dratini's number was clear to the eye,
  yet no way of reading it worked: the foil's glitter left grey blotches all round it, and its light
  glued the "/" to the "2" and the "10" together. Dropping the specks, as guessed, cleaned the copy
  but still read "7210". What worked: a copy that keeps only the blackest ink, which drops the glitter
  and pulls the digits apart - "72/110".
  - It is one more way of reading the number corners, tried last, only when the usual ways don't
    agree. Tried second in line, it made the Devolution Spray's number fit Blastoise's too, and that
    card stopped opening by its number alone; last, cards that read fine read exactly as before.
  - A lab (`dev-local/foil-number-lab.js`) read your 53 photos 19 ways and replayed the orders: 3
    more numbers sure, none wrong. How black counts as "blackest" was tried at 5 levels: looser read
    wrong numbers, stricter read fewer.
  - Your Dratini: its number now reads, so it opens by its number before the name is read - in 4.4
    seconds instead of 9.5 (on this PC).
  - Your 46 real photos: numbers read 37 (36), opened by the number alone 25 (24), right card first
    46, opened by themselves 45, 0 wrong, 2.8 seconds per photo as before. The cut photos as before (5
    of 7 first and opened, 0 wrong). Full-art: 27 first and opened, 20 by the number alone (18), a
    little quicker. Special numbers: 19 read (18), 24 first, 22 opened, 0 wrong. Made-up photos: 7
    numbers read (6), 13 first, 12 opened, 0 wrong. Learning: as before (45 of 46 recognised, 0
    wrong; the harder second photos 29 recognised, 7 suggested, 10 neither). The cost: a card whose
    number can't be read at all tries 6 more reads, about a tenth of a second.

## Done in 1.50.0

- **Delete a kid's account, not just remove it** (you asked: "I need a way to also delete accounts
  not just remove"). **Kids' accounts** gets **Delete** by each kid (in orange, as it can't be
  undone), asked once more before it happens. It deletes the kid's cards, learned cards and
  settings, the account itself - the kid can't sign in any more, and the username is free again -
  and the kid's place in your list and kept password. **Remove** still only takes a kid off the list.
  - Firebase only lets an account delete itself, so the app signs in as the kid in the background
    with its kept password (1.49.0), the way it makes kids' accounts. For a kid made in 1.48.0 it
    asks for that password first.
  - **Needs you once more: publish the new `firestore.rules`** (SETUP-ACCOUNTS.md, step 6): only you
    may take away your kid's link to you. Until then **Delete** says so and deletes nothing - it
    checks the rules and the password before deleting anything.
  - Needs **Enable delete** ticked in Firebase (it is, in your screenshot).
  - Tried on the test copy: a kid with cards, learned cards and a setting deleted - all of it gone,
    and the kid's sign-in refused; with the rules you have now, refused with nothing deleted; without
    a kept password, it asks for one. The rules one by one, 10 of 10: a kid can't delete its own link
    to escape you, and a stranger or a look-alike email can't read or delete any of the kid's things.

## Done in 1.49.0

- **Look up a kid's password** (you asked: "I need a way i can check the kids password"). Firebase
  keeps passwords scrambled, so they can't be read back from it. Instead, the password you give a
  kid's account is kept in your account, which only you can read, and **Kids' accounts** gets
  **Show password** for each kid. For a kid made in 1.48.0, type its username and password in the
  form once: it is checked, then kept. **Remove** forgets it too.
  - **Needs you once more: publish the new `firestore.rules`** (SETUP-ACCOUNTS.md, step 6). Until
    then, making a kid still works, and the app says to write the password down.
  - The trade-off: someone who gets into your account could see the kids' passwords - but could
    see and move their cards anyway, and a kid's password only opens that kid's Kortpris account.
  - Tried on the test copy: made, shown, hidden, a wrong password refused ("That isn't …'s
    password"), removed; the rules again one by one, now 14 of 14 (a kid, a stranger or a look-alike
    email can't read or change your kept passwords). Also with the rules you have now, and with the
    new ones published while the app was open: the password then shows at once.

## Done in 1.48.0

You asked for 4.1 to 4.3. All three were tried on Firebase's local test copy with made-up accounts
only; nothing touched your real project. **Needs you once: publish the new `firestore.rules`**
(SETUP-ACCOUNTS.md, step 6). Until then 4.3 works, the Claude key stays on each phone as before, and
making a kid's account says the rules must be updated first. The app was also tried with the old
rules, so nothing breaks in between.

- **4.1 Kids' accounts under a parent.** In **My cards → Kids' accounts** you make an account for each
  kid (a username, and a password - **Make an easy one** gives three words and a number, like
  "piano-puppy-panda-22"). Signing in with it on the kid's phone opens the app in kids mode, with
  only the kid's cards. On your phone, My cards gets a button for you and each kid: pick a kid to
  see their cards - and cards you scan then go to them - and a saved card's page gets **Move to**
  (one, or all). A kid who already has an account can be added with its username and password.
  **Remove** takes a kid off your list (their account and cards stay; the password brings it back).
  - Safe by the rules, tried one by one against the test copy (11 of 11): a kid can't see your cards
    or your Claude key, can't change who its parent is; a stranger, an account with a look-alike
    email, or someone listing your kid as theirs can't see the kid's cards.
  - Moving needs internet: without it, it says so after about 9 seconds.
- **4.2 The Claude key in the account.** Saved once, it works on every phone you sign in on, and
  still only for your account. A key already saved on a phone moves into the account by itself -
  only once Firebase itself has said the account has it, so it can't get lost on the way.
- **4.3 My cards without internet when signed in.** Firebase keeps a copy of the account's cards on
  the phone: with the test copy switched off, a reload showed the account's cards, a card added
  meanwhile stayed through another reload, and it reached the account when the test copy came back.
  Found and fixed on the way: a brand-new account, with no cards yet, would have waited at "Loading
  your cards…" forever with the copy on.

## Done in 1.47.0

- **1.9, more: cards reaching the photo's edge.** A lab (`dev-local/edges3-lab.js`) cut 39 of your
  photos three ways each, so the card reaches the photo's edge: top and bottom (like your Dratini),
  one side, or a corner, from 2% past the edge to 1% inside it. The finder already coped with most
  of them - a yellow border shows how big the card is even with a side cut off - and missed 6 of 117.
  - New: when nothing else is found, the app looks for a card-shaped box with one or two sides at
    the photo's edge, and works out where a cut-off side must be from the card's shape and the sides
    it can see. Like 1.46.0's doubtful boxes, it counts once the number reads where the box says it
    is printed - or, for these boxes, the name: their shape pins them down.
  - The 6 cut photos and your Dratini: the right card first in 5 of 7 (2 before), opened by itself 5
    (2 before), none wrong. Two cuts of your Erika's Jigglypuff now open as the 30th Celebration
    reprint, as the box lets its "30" stamp be checked.
  - Your Dratini itself: its box is found and checked by the name, and it opens right as before -
    but in 8 seconds instead of 3, as the number corners are now read, and the foil around its number
    hides it (see 1.11, done in 1.51.0). None of the 56 photos without a card gets such a box.
  - Your 46 real photos: 46 first, 45 opened by themselves, 0 wrong (as before). Full-art: 27 first,
    27 opened. Special numbers: 18 read, 24 first, 22 opened, 0 wrong. Made-up photos: 13 first, 12
    opened, 0 wrong. Learning: 0 wrong; the harder second photos 29 recognised, 7 suggested, 10
    neither (the Dratini's is no longer suggested: 0.602 from its learned look, where the line is 0.6,
    as it is now learned with its box).

## Done in 1.46.0

- **1.9, in part: the edges of silver-bordered cards in photos from the phone's own camera.** A
  measuring lab (`dev-local/edges2-lab.js`) weighed every box the shape finder considers on 129
  photos - your real ones, the made-up full-art ones, and 56 without any card - and showed why a
  lower bar can't work: the Gengar's right box in its toploader scored 1.26, a wallpaper without a
  card 1.33, both with edges all round and the border's inner edge just inside. So:
  - A box scoring from 1.0 to 1.3 is doubtful, and counts once the number reads sure (two reads
    agree) where that box says it is printed - which nothing but a card does. Your Gengar is now
    found this way, and opens by its number in 3.1 seconds instead of 8.6.
  - A picture with a card's own shape (a scan, or a photo cut to the card) is the card as a whole:
    your scanned Legendary Collection Pikachu now tells its reverse holo from the Base Set one by
    the sparkle, and opens by itself.
  - On a card under 700 pixels tall (a small scan), the number's place isn't read: its print is a
    few pixels high (6.6 seconds for nothing on the 450-pixel scan).
  - Your 46 real photos: 46 first, 45 opened by themselves (44 before), 0 wrong; reverse holo or not
    46 of 46. Full-art: 27 first, 27 opened. Special numbers: 18 read, 24 first, 22 opened, 0 wrong.
    Made-up photos: unchanged (13 first, 12 opened, 0 wrong). Learning: 0 wrong; the harder second
    photos 29 recognised, 8 suggested, 9 neither (10 before).

## Done in 1.45.0

- **1.10 Celebrations Classic Collection cards (2021) open as themselves**, not as their originals.
  Like the 30th Celebration reprints, each carries its original's number ("4/102" on the
  Charizard), which TCGdex numbers CC001 to CC025, so a search by the number found only the
  original. Now each is added next to its original (listed by id in `CLASSIC_NUMBERS`, as the names
  differ), and its "25" stamp - where the 30th Celebration's "30" is - tells them apart. Base Set
  Charizard has both reprints; the app shows whichever two its stamps can't tell apart. Cards saved
  before 1.32.0 with the old database's ids ("cel25c-4_A") are now translated too.
  - Made-up photos of the 25 cards: 22 first, 22 opened by themselves, 0 wrong (before: none
    found by its number, and a photo of one opened its original). Of the other 3, two had their
    text misread ("Throh" for Xerneas EX), and M Rayquaza EX's edges weren't found, so the stamp
    couldn't be checked: both cards are shown, the original first.
  - Made-up photos of their 25 originals: 24 first, 23 opened, 0 wrong. Mewtwo-EX ties with its
    Legendary Treasures print (the same picture), as before.
- **A wrong card no longer opens because it alone came from a set of the size read.** That rule
  (and those for the set code, a nearby number and sparkle) now picks only among cards that look
  like the photo at all (`LOOK_ALIKE_MOST_DISTANCE` 1.5; right cards scored up to 1.46). Found
  while testing: since 1.44.0 gave the trainer kits pictures, a Shiny Vault Shuckle whose number
  read "4/11" opened a trainer kit Machoke 4/11, although nothing looked like the photo (1.75 at
  best). The special numbers test is back to 0 wrong.
- **What 1.44.0's new pictures changed in the made-up photos**, checked against 1.43.0: two of 16
  now aren't opened by themselves (13 first and 12 opened instead of 14 and 13, 0 wrong), because
  cards with the same picture got one. The Pokémon 151 Pikachu's picture is also the McDonald's
  2024 Pikachu's, and the Evolutions Charizard's is the Celebrations and 30th Celebration
  Charizards'. Without the number the app can't tell them apart, and now shows both rather than
  opening one by luck.
  - Your 46 real photos: unchanged (46 first, 44 opened, 0 wrong). Full-art: 27 first, 27 opened,
    0 wrong. Special numbers: 18 read, 24 first, 22 opened, 0 wrong. Learning: unchanged (harder
    second photos 29 recognised, 28 before the reading, 10 neither, 0 wrong).

## Done in 1.44.0

- **5.2 Pictures for the cards TCGdex has none of** come from Scrydex now, from the old database's
  makers (`scrydexIdOf` in `card-ids.js`). TCGdex had no picture of 1,621 cards: 958 borrowed the
  old database's, which may go in March 2027 (and a few of those were a card's back, like the SVP
  Oddish's), and 663 had none at all - the MEP promos, McDonald's 2023 and 2024, the Mega
  Evolution energies and the trainer kits among them. Scrydex has 1,552 of the 1,621, checked
  against its own set lists (it answers a card it hasn't with a card's back, so its ids must be
  right); 69 still show a grey "?". Cards saved or learned with the old database's picture get
  Scrydex's once. Its small pictures are a third of the old database's size (about 50 KB).
  - 30 of these cards, as made-up photos: 27 first by their looks alone (the other 3 share their
    picture with another card, and the number picks them), 26 opened by themselves; the right
    card's picture was 0.01 to 0.12 from the photo. The 2 Celebrations Classic Collection cards
    opened as their originals, as before: see 1.10.
  - Your 46 real photos: unchanged (46 first, 44 opened, 0 wrong).

## Done in 1.43.0

- **2.3 Remember database answers for a day** on the phone (`askTcgdex` in `cards.js`). Every
  answer from TCGdex - searches, a card's prices, the list of sets - is kept in a cache of its own
  (Cache Storage, which holds far more than localStorage) and used again for a day. Scanning a card
  again, or opening a saved card, asks the database nothing, and a card scanned earlier that day
  opens even without internet (checked with the internet cut off). "Update prices" in My cards
  still asks for today's prices. Answers over a day old, and the oldest past 1,000, are thrown away
  once a visit; an answer reporting errors isn't kept. The sets' own day-long copy in localStorage
  ("kortpris.sets") is gone: they are kept like any other answer now.
  - Your 46 real photos, twice: 2.9 seconds a photo with nothing kept, 2.7 seconds the second time
    (59 answers kept), with the same results (46 first, 44 opened, 0 wrong). A card that opens also
    asks for its prices (0.1 seconds here), which the test doesn't, so a card scanned again opens
    about 0.3 seconds sooner on this PC - more on a phone's mobile internet.

## Done in 1.42.0

- **2.4 The number first, the name only when needed.** Once the card's edges are found, the number
  is read before the name. When two reads of it agree, the cards with that number (in a set of the
  size read) are compared with the photo straight away, and a clear winner opens without the name
  being read (`cardByNumberAlone` in `matcher.js`). Reading the name takes about as long as the
  number (1.65 against 1.4 seconds a photo on this PC), so those cards take about half the time.
  A card opens this way only when its picture is also close to the photo, as a misread number can
  fit a single, different card; right cards scored 0.12 to 1.46 there and other cards mostly over
  1.3, so the limit is 1.0 and the few right ones above it wait for the name, as before.
  - Your 46 real photos: 23 opened by the number alone, all right, in 1.4 seconds on average. All
    together 2.9 seconds a photo instead of 3.8, with the same results: the right card first 46 of
    46, opened by itself 44, 0 wrong.
  - Special numbers: unchanged (18 read, 24 first, 22 opened, 0 wrong), 15 by the number alone.
  - Full-art: unchanged, 18 of 27 by the number alone.
  - Made-up photos (reading test): unchanged (14 of 16 first, 13 opened, 0 wrong), 3.7 seconds a
    photo instead of 4.3.
  - Not when a learned card has opened early: its text is still read whole, to check it.

  On a phone, where reading is several times slower, a card found by its number should open
  several seconds sooner.

## Done in 1.41.2

You picked 2.2 and 3.5 after the graded prices.

- **2.2 The text reader starts when the app opens**, a second after the page has loaded, not at
  the first photo (`startReaderEarly`). It needs about 7 MB (3.9 MB program, 2.9 MB English), kept on
  the phone after the first time, and a moment to start on every visit; the first scan used to wait
  for whatever of that the finding of the card didn't cover. Now it's ready while you point the
  camera. It starts even when Claude reads the cards, as it takes over whenever Claude can't.
  Tested in the test browser: started 1.1 seconds after opening, and the example card read as
  before.
- **3.5 The camera details are hidden.** The line at the bottom that said what the camera gave
  ("camera 2160×3840 (live picture) · soft (0.08), sharpened") now shows only the version. To see
  the details again, open the app in the browser with `?camera` at the end of the address:
  https://mzdad.github.io/kortpris/?camera

## Done in 1.41.1

- **The links are in a menu too.** With "Fetch PSA prices automatically" unticked, the card page
  still showed the loose "PSA 10 / PSA 9 sales on eBay" and PriceCharting links, and no menu - you
  looked for the new menu there. Now there is always one line to tap: without prices it is "See
  sales on eBay and PriceCharting", with links for PSA 10, 9 and 8, CGC 10 and BGS 9.5; with
  prices it is the menu of 1.41.0, which now ends with the PriceCharting link.

## Done in 1.41.0

- **Better graded prices, in a menu.** You asked for the PSA improvements and a way to see the eBay
  sales, without cluttering the card page. The price service already sent more than the app showed;
  the relay now passes it on (deployed 27 September 2026):
  - **Each grade's price is today's price**: the price service's own estimate, which counts recent
    sales most and leaves odd ones out, instead of the middle of months of sales. For the Mewtwo
    from 151 in PSA 10 that is $174 instead of $115, because its price has been rising.
  - **A menu under the PSA table**, "Last sales, other companies and eBay", closed at first. It
    lists every grade with its number of sales, how sure the price is (sure, fairly sure,
    unsure), the day of its last sale, and a link to that grade's sales on eBay for the version
    picked. It stays open while the page is drawn again, like when you pick another version.
  - **Other grading companies**: CGC, BGS, SGC, TAG and ACE, in the same menu.

  The two fixed "PSA 10 / PSA 9 sales on eBay" links now show only when there's no table. Prices
  the relay and the phone kept from before are fetched again once, in the new shape. Tested in the
  test browser with a saved answer (no lookups spent), in English and Danish at phone width, and
  once against the real relay.

## Done in 1.40.0

You asked for 1.7 to 1.9 after putting the languages on the roadmap (part 6). 1.7 is done; 1.8 and
1.9 are partly done, and what is left of them stays below with the same numbers.

- **1.7 The set's code is read.** Cards since 2023 print their set's code by the number ("PAF EN
  057/091"), white in a little box. When a card's number looks like one of those (padded to three
  digits) the box is read with only capitals and digits allowed, and a code is kept when its set
  has the size read after the "/" (`readSetCode` in `reader.js`, the codes in the new
  `set-codes.js`). Among cards that look alike, the one from that set is then picked - Black Bolt,
  White Flare and Chaos Rising all have 86 cards, and Paradox Rift and Destined Rivals 182. Only
  among look-alikes, so a misread code can't open a card that looks nothing like the photo. Read on
  22 of 33 made-up photos of ordinary cards from 2023 to 2026 and on 10 of the 16 such full-art
  cards, never a wrong code, and none made up on older cards. Allowed any character, Tesseract read
  "PAF" as "PAfo". Your Gengar and Gastly photos don't get one yet: the Gengar's edges aren't found
  (1.9) and the Gastly's number was misread, so its code isn't looked for.
- **1.8, partly: white numbers.** A last way of reading the number keeps only the near-white print,
  judged against the whitest print in the corner (`whiteInkOnly`); the white-ink copy of 1.28.0
  judged it against the colours around it, which broke the black-edged white digits into pieces.
  Italic print also turns the "/" into a 7 ("2397091" is 239/091) or leaves a dot by it
  ("239/.091"): both are now understood. In the full-art test the right card came first 27 of 27
  times (25) and opened by itself 27 times (25), with 21 numbers read (20), 0 wrong.
- **1.9, partly: yellow borders in crooked photos and bad light.** The border's yellow is now counted
  along lines leaning up to 6 degrees, at the lean where it lines up best, and a single border
  line is enough when glare hides the others: the yellow along it shows how far the card reaches.
  Before, one side border and the bottom border could make a box the size of their corner, which
  happened in 4 of 41 harder made-up photos. The card's edges are now found in 37 of those 41 (32).
  In the learning test, of 46 harder second photos 29 are recognised (25) and 28 opened before
  the reading (22), and 10 neither recognised nor suggested (13); still 0 wrong, and no stranger
  taken for a learned card. Your real photos: the right card first 46 of 46, opened 45, 0 wrong;
  the special numbers test as before. No false cards in 112 cuts of pictures without one.


## Done in 1.39.2

- **Auto finds dark and silver-bordered cards.** Your screen recording showed Auto saying "Fill
  the frame with the card" for about 10 seconds while a Mega Darkrai ex in a toploader filled it,
  on a dark red-and-black cloth with the light on; it took the photo at 22 seconds. Auto used the
  same card finders as the photo reading, and those only trust a box with a sharp colour change
  across its edges or a border line just inside - which a dark card on a dark cloth has neither of:
  in 80 frames of the recording they found the card 4 times. Auto now uses a gentler check of its
  own (`findCardShapesInFrame` in `card-finder.js`): it looks only around the white frame, and a
  card-shaped box that fits the frame with edges all round is enough, as the photo is checked
  properly afterwards anyway. As the card's edges, the toploader's and a line in the card's picture
  can all make such a box, it follows the one nearest where the card just was. Tested on the
  recording, turned back into what the camera saw: the photo would be taken at 6.5 seconds, a
  second after the card settled. No card found in 756 cuts of pictures without one (Windows'
  photos and the Ordriget game); your 39 card photos all found; and the shaky pretend-camera tests
  of 1.39.1 all still pass.

## Done in 1.39.1

- **Auto now takes the photo on a real phone.** You tried Auto and it kept saying "Hold still…"
  without ever taking the photo. The stillness check compared the whole picture between looks, and
  a real camera's grain alone changed it more than it allowed - a test camera with grain and no
  movement at all never passed, nor did any hand shake. Now it checks that the card's edges stay
  put (each may move at most 3% of the card's size between looks, `STILL_MOVE` in `camera.js`),
  and once the card has filled the frame for 3 seconds the photo is taken anyway, so it can't get
  stuck again. After "Save and scan the next" the frame must now look empty twice in a row before
  a new card counts, as one look can miss a card that is there. Tested with a pretend camera
  showing one of your photos with grain and hand shake: still or shaking a little, taken after
  1.0-1.2 seconds; shaking a lot, after 3.6 seconds; the saved card not taken again in 5 seconds;
  the next card after 1.0 seconds; one missed look not taken for a new card; Auto off, nothing.

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
| 1.8 | **Numbers printed white on full-art cards**, in italics and edged in black: the rest. | 6 of 27 full-art numbers still aren't read in 1.40.0 (8 in 1.28.0). The made-up photos are made from the database's small pictures, so a real photo may read better: worth checking with a few real full-art photos first. The name and the look find these cards anyway. | S |
| 1.9 | **Find the edges of silver-bordered cards** in photos from the phone's own camera: the rest. Full-art cards on a grey table. | The name strip, the number corners and the set code (1.7) need them. On the 2 made-up full-art photos on a grey table, the best box found covers only the card's top-left part (81% of it): the silver border is the table's colour, so the card's own bottom and right edges hardly show. Checking the box can't help there - the name strip is in that part too, and reads the right name - so it takes a better way to see a silver border on grey. They are found by name and picture anyway, and the app's own camera doesn't need this: its frame gives the edges (1.1). | M |
| 1.12 | **Pokémon cards photographed sideways**, turned the right way up the way Magic cards are since 1.57.0 (`lookAtMagicPhoto`): the card is the biggest card-shaped box, upright or turned. | Photos sent through a messenger can lose which way up they are (16 of your 32 Magic photos did). The Pokémon reader needs its 46-photo test to stay the same. | S |

## 2. Quicker

| | What | Why | Size |
|---|---|---|---|
| 2.6 | **A paid card database (Scrydex)**, from the makers of pokemontcg.io. | Graded prices and picture recognition built in. Costs money (from $29 a month, September 2026): your decision. Since 1.32.0 the free TCGdex (5.1) is quick, reliable and up to date. | M |
| 2.8 | **Prices by condition** for ungraded cards: "What condition is your card in?" (Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged) changes the price. | The prices shown are for cards in top condition, and a worn card sells for much less. Checked 27 September 2026: PokemonPriceTracker's free plan (the PSA relay's source) gives only each version's Near Mint price, the same as TCGdex's TCGplayer price. The other conditions look like a paid plan: your decision. Its eBay "ungraded" sales can't stand in: for a $2 Mewtwo they said $22, with other cards' sales mixed in. | M |

## 5. Keeping the app working

| | What | Why | Size |
|---|---|---|---|
| 5.3 | **The test pages' photos** are made from the old database's big pictures, which may go in March 2027. | Then the tests can't run. Scrydex has the same pictures under the same ids (5.2), but new photos would change the tests' results a little, so only when needed. | S |

## 6. Cards in other languages

You asked about Chinese, Korean, Indonesian and Japanese cards (27 September 2026). What TCGdex has,
checked that day: Japanese 13,000 cards, about 1 in 3 with a picture, with real Cardmarket prices
for the Japanese cards (5 of 6 sets sampled; the newest not yet); traditional Chinese 7,400 cards
and Indonesian 2,800, but with the Japanese card's price, as they follow the Japanese sets;
simplified Chinese 877 cards without pictures; Korean 239 cards without pictures. None has
TCGplayer prices. The app's reader only reads English, but modern cards print their set's code and
number in plain letters ("SV2P 006/071"), which with the picture comparison should find most cards.

| | What | Why | Size |
|---|---|---|---|
| 6.1 | **Japanese cards**: a card-language choice (remembered), finding the card by set code and number (1.7) and its picture, Japanese prices from Cardmarket, and My cards keeping which language each card is. | The one Asian language with its own prices. Cards before about 2001 print no number, so they could only be found by their picture. | L |
| 6.2 | **Chinese and Indonesian cards**, the same way, with the price clearly marked as the Japanese version's. | TCGdex has the cards, but only the Japanese card's price, which these printings usually sell for less than. | M |
| 6.3 | **Korean cards**, if TCGdex (or another free database) gets them. | 239 cards and no pictures in September 2026: not enough to find cards by. | - |

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

## 7. Magic: The Gathering

You asked (28 September 2026): "Is it possible to add Magic the gathering cards aswell? So we make
this app multiuse?", then "YEs start with 1". Magic cards come from **Scryfall** (scryfall.com): free,
no key, it answers web pages directly, pictures included, and it has every printing of all 35,000
Magic cards, with Cardmarket (euros) and TCGplayer (dollars) prices for normal and foil copies,
updated daily. Its conditions: the app stays free, doesn't claim Scryfall made it, shows card
pictures untouched, searches at most twice a second, and keeps answers for a day. Wizards of the
Coast asks fan apps to say they are unofficial, which the page's foot now does.

| | What | Why | Size |
|---|---|---|---|
| 7.5 | **Tell a Magic foil from its normal copy** in the photo, by its rainbow shine, and open it on its foil price. | Your two foil Icy Manipulators come second, behind the normal copy with the same picture. The glitter measure that finds Pokémon reverse holos doesn't tell Magic foils apart (foils 0.8–1.8, normal cards 0.8–3.6): a Magic foil shines in rainbows, not fine glitter. | M |
| 7.6 | **Magic printings with the same picture**: read the copyright year at the bottom (Summer Magic ©1994, Fourth Edition ©1995) and see the border's colour. | Your Sengir Vampire and Nightmare come second or third, behind Summer Magic copies worth many times more. The list shows both to tap, and a tapped one is learned. | M |
| 7.7 | **Faint names on old white Magic cards**, the last two: Kismet and Kjeldoran Knight. | Two of your 32 photos read no name; the name box can be typed in meanwhile. 1.58.0 reads the others (Femeref Knight, Radiant, Archangel), but no way of reading this Tesseract reader has tried gets more than half of these two names: light letters with a shadow, on a bar of the same grey, about 30 pixels tall in a photo cut down by Signal. First try photos from the app's own camera. | S |
| 7.8 | **A Pokémon card photographed in Magic mode** makes up a Magic name. | Reading 46 Pokémon photos and 28 pictures without a card as Magic cards, 16 of 74 got a sure name ("The Sea Devils", "Chameleon Blur") in 1.57.0 - 18 in 1.58.0. The look check then lists printings that look nothing like the photo. The app could say "this doesn't look like a Magic card" when none of the printings' pictures comes close (0.6 is a match, 1.5 the most) - and a Pokémon card's yellow border tells the two games apart. | S |
| 7.4 | **Other card games** with a free database, the same way (Yu-Gi-Oh!, Lorcana). | With a game switch in place, each game is its database, its reading and its texts. | M each |

## Not planned

- **Grading a card's condition from the photo.** Too unreliable for prices that differ this much.
- **2.5 Compare fewer pictures** when only the name is known (dropped 27 September 2026, after
  2.4). Only 7 of your 46 real photos compare more than one picture now, and the big piles (230
  Pikachus, 97 Unowns) come from misread numbers, so the set size and numbers read seldom point to
  the right card. Comparing those "likely" cards first saved 25 of 475 pictures and would have
  opened the wrong card once (the Jigglypuff reprint, whose original has the same number). The cost
  is mostly the first download: 216 pictures take 0.4 seconds once kept on the phone, 3.3 seconds
  on this PC the first time (about 16 KB each), and the app keeps 1,500.
