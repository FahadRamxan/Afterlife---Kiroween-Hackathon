# Who Afterlife is for

Afterlife rebuilds business software whose developer and source code are gone. This page says who
needs that, and why now, with a source for every claim. Researched on 24 November 2026.

## The people

Registered Pakistani businesses (distributors, wholesalers, manufacturers, pharma distributors,
larger pharmacies and retail chains) whose billing software was written long ago by a small
software house that is gone. These programs are dBASE, Clipper, FoxPro or Visual FoxPro apps, on
DOS or Windows, and they keep their data in `.DBF` tables, the files Afterlife reads.

They are not small kiryana shops: most of those keep a paper khata, and an industry estimate in
2022 put digitised retailers at about 5,000 ([Profit, 2022][profit-kiryana]). Our Barkat sample
is a kiryana ledger because it is a good teaching app, not because kiryana shops are the market.

## What they run today

- Nobody runs DOS at the counter. Windows 11 and Windows 10 are 99.7% of Pakistani desktops, and
  Windows 7 is 0.2% ([StatCounter, October 2026][sc-win]). Old programs run on those PCs as
  Windows apps, or as DOS apps under DOSBox-X or vDos ([vDos][vdos]).
- Old Windows programs are still kept alive. Firms in Lahore and Karachi hire developers to
  maintain and migrate Visual Basic 6 programs ([Rozee.pk][rozee-vb6]) and MS Access ones
  ([Rozee.pk][rozee-access]).
- Owners use phones. Easy Khata, a phone ledger for shops, shows 5M+ downloads on Google Play
  ([Google Play][easykhata]), and about half of Pakistan's web traffic comes from phones
  ([StatCounter][sc-platform]).
- Large retailers moved to FBR-integrated point of sale: 13,900 integrations covering 37,939
  outlets up to 30 September 2026 ([FBR][fbr-pos]). Most registered businesses had not moved: by
  the end of March 2026 only about a third of registered taxpayers were issuing live digital
  invoices ([PK Revenue][pkrevenue]).

So DOS is the hardest case we demo, and the market is old Windows billing programs whose maker is
gone. The reborn app is a web app for the PC the shop already has and for the owner's phone, in
Urdu or English, and it keeps the old program's keys.

## Why now: FBR digital invoicing

- FBR's own FAQ: under S.R.O. 709 of 22 April 2025, electronic invoicing is mandatory for all
  corporate and non-corporate sales-tax-registered persons. Their POS, ERP or other invoicing
  system must be integrated with FBR through a licensed integrator. PRAL integrates free of
  cost, and missing the deadline brings penal action under section 33 ([FBR FAQ][fbr-faq]).
- S.R.O. 1413(I)/2025 of 1 August 2025 obliges all sales-tax-registered persons to integrate and
  issue digital invoices, by 1 December 2025 ([Business Recorder, 10 Aug 2025][br-aug];
  [Business Recorder, 1 Apr 2026][br-apr]).
- Each invoice goes to FBR before it is issued and gets a unique 22-digit FBR invoice number,
  printed with a QR code ([Business Recorder, 10 Aug 2025][br-aug]).
- An issued e-invoice can be cancelled or edited only within 72 hours, after that only with the
  Commissioner's approval (FBR Sales Tax General Order 01 of 2026, [PDF][fbr-stgo]).
- The Prime Minister directed FBR to launch digital invoicing in Urdu (14 July 2025,
  [Profit][profit-urdu]).

An old program whose source is gone cannot be changed to do this. Today's answer is a new POS
that moves the data (vendors quote Rs 10,000 to 50,000, [EloERP][eloerp]) but not the old
program's rules: its discounts, rounding, credit terms and counters. Afterlife keeps the rules,
proves the new app does what the old one did, moves the data across exactly, and issues
FBR-ready digital invoices.

## Beyond Pakistan

- About 5,300 companies still run Microsoft Visual FoxPro, an estimate by Enlyft
  ([Enlyft][enlyft]), whose support ended in 2015. Pakistani Visual FoxPro maintenance work is
  still advertised ([jobz.pk][jobz]).
- FoxPro 2.6 for DOS apps still run on today's PCs under DOSBox-X and vDos, which exists to run
  DOS business software on Windows ([vDos][vdos]).

## What we do not claim

- That most Pakistani shops run DOS or FoxPro software: nobody has counted them.
- That Afterlife is integrated with FBR: the receipts are "FBR-ready (sandbox)" until a licensed
  integrator connects them. We never use FBR's logo.
- That the Graveyard apps are real: they were written by our team to simulate 1990s software. A
  holdout app the pipeline was never tuned for is scored separately.

[fbr-faq]: https://fbr.gov.pk/faqs/173967/173969
[fbr-stgo]: https://download1.fbr.gov.pk/Docs/2026331133557466STGO01of2026.pdf
[br-aug]: https://www.brecorder.com/news/40377164
[br-apr]: https://www.brecorder.com/news/40414134
[profit-urdu]: https://profit.pakistantoday.com.pk/2025/07/14/pm-shehbaz-orders-urdu-launch-for-digital-invoicing-urges-inclusive-tax-reforms
[profit-kiryana]: https://profit.pakistantoday.com.pk/2022/09/18/help-is-here-but-will-kiryana-stores-take-it
[eloerp]: https://eloerp.net/blog/pos-software-pakistan-complete-guide
[enlyft]: https://enlyft.com/tech/products/microsoft-visual-foxpro
[jobz]: https://www.jobz.pk/visual-foxpro-jobs/
[vdos]: https://sourceforge.net/projects/vdos
[sc-win]: https://gs.statcounter.com/windows-version-market-share/desktop/pakistan
[sc-platform]: https://gs.statcounter.com/platform-market-share/desktop-mobile-tablet/pakistan
[rozee-vb6]: https://www.rozee.pk/senior-developer-sql-visual-basic-6-lahore-jobs-1938549
[rozee-access]: https://www.rozee.pk/vba-developer-microsoft-access-lahore-jobs-1869436
[easykhata]: https://play.google.com/store/apps/details?id=com.tech.bazaar.easykhata
[fbr-pos]: https://www.fbr.gov.pk/pos-integrated-retailers/163085/163089
[pkrevenue]: https://pkrevenue.com/fbr-to-seek-tougher-penalties-for-digital-invoicing-violations-in-finance-bill-2026/
