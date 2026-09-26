# Kortpris roadmap

What to build next, and why. Started 26 September 2026 at version 1.25.0, and kept up to date:
finished items move to "Done" with their version, and keep their number. Biggest wins first
within each part; the size is a rough guess of the work (S = an hour or two, M = a session,
L = several sessions).

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
| 1.3 | **Full-art and gold cards**: the name and number sit on the artwork. | The reader loses text on busy backgrounds; the "ink only" copy used for numbers could help names too. | M |
| 1.4 | **Learned cards as suggestions**: a learned card that looks somewhat like the photo, but not clearly enough to open, is added to the cards the photo is compared with. | Today a learned card either opens or plays no part. | S |
| 1.5 | **Keep collecting failed photos** in `dev-local/` with the right answers. | Every fix so far came from a real photo that failed. The test set is 40 photos. | ongoing |
| 1.6 | **A second look at the number in any photo**: when the reads don't agree, read the number corner again from a slightly bigger and smaller cut of the card. | In 1.26.0 a second cut (the camera frame) turned 11 read numbers into 13. Photos from the phone's own camera have no frame, but could get the same second chance. | S |
| 1.7 | **The set's code on newer cards**: since Scarlet & Violet, cards print their set's code by the number ("PAL EN 123/193"). Read it with the colours turned around, as it is white on black. | The code names the set exactly; today the set is guessed from its size, which several sets share. In 1.27.0 the "SVP" code was read in only about 1 of 3 tries. | M |

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
