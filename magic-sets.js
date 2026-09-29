"use strict";

// Every Magic: The Gathering set printed on paper, by its code - the one a card prints in its bottom-left
// corner from 2014 on ("SOI", "M15") - with how many cards the set has: the number after the "/" ("246/297").
// From Scryfall's list of sets (api.scryfall.com/sets, 2026-09-28): 992 sets. magic-reader.js uses it to
// tell a set code read from a photo from a misread one ("SOT" is SOI). Sets that come out later aren't here:
// their cards are still found by their name.
const MAGIC_SET_SIZES = Object.fromEntries(`
10e:383 2ed:302 2x2:331 2xm:332 30a:594 3ed:306 40k:168 4bb:378 4ed:380 5dn:165 5ed:460 6ed:350 7ed:350
8ed:357 9ed:359 a25:249 aacr:20 aafr:81 ablb:54 abro:81 aclb:81 acmm:81 acr:309 adft:54 admu:81 adsk:54
aecl:54 aeoe:54 aer:184 afc:62 afdn:55 afic:24 afin:53 afr:281 ainr:25 akh:269 akhm:81 ala:249 alci:81 all:199
altc:24 altr:81 amh1:54 amh2:81 amh3:54 amid:81 amkm:49 amom:81 amsh:66 aneo:81 aone:81 aotj:54 apc:143
arb:145 arc:150 arn:92 asnc:81 asos:54 aspm:54 astx:162 atdm:54 ath:85 atla:54 atle:12 atmt:54 atq:102 avow:81
avr:244 awoe:81 aznr:81 bbd:254 bchr:125 bfz:274 big:95 blb:397 blc:356 bng:165 bok:165 bot:29 brb:136 brc:209
bro:287 brr:189 btd:90 c13:356 c14:337 c15:342 c16:351 c17:309 c18:307 c19:302 c20:322 c21:81 cc1:8 cc2:8
ced:302 cei:302 chk:306 chr:125 clb:361 clu:284 cm1:18 cm2:312 cma:320 cmb1:121 cmb2:121 cmd:318 cmm:1067
cmr:718 cn2:221 cns:210 con:145 cp1:6 cp2:6 cp3:6 csp:155 cst:62 dbl:535 dci:80 dd1:62 dd2:64 ddc:62 ddd:63
dde:71 ddf:79 ddg:81 ddh:80 ddi:77 ddj:90 ddk:80 ddl:81 ddm:88 ddn:82 ddo:67 ddp:80 ddq:80 ddr:76 dds:65
ddt:63 ddu:76 dft:553 dgm:156 dis:180 dka:158 dkm:58 dmc:240 dmr:457 dmu:281 dom:269 dpa:113 drb:15 drc:184
drk:122 dsc:373 dsk:417 dst:165 dtk:264 dvd:62 e01:106 e02:48 ecc:176 ecl:408 eld:397 ema:249 emn:205 eoc:191
eoe:400 eos:180 eve:180 evg:62 exo:143 exp:45 f01:7 f02:12 f03:13 f04:12 f05:12 f06:12 f07:12 f08:12 f09:12
f10:12 f11:12 f12:13 f13:12 f14:12 f15:12 f16:12 f17:12 f18:3 fbb:307 fbro:5 fca:65 fclu:10 fdc:319 fdmu:10
fdn:771 fem:187 ffdn:10 fic:486 fin:598 fj22:46 fj25:46 fjmp:46 fltr:10 fmom:5 fmsc:61 fnm:11 fone:5 fra:461
frc:103 frf:185 ftla:10 ftmc:5 fut:180 g00:2 g01:2 g02:2 g03:3 g04:6 g05:4 g06:4 g07:5 g08:5 g09:10 g10:8
g11:8 g17:5 g18:5 g99:1 gdy:9 gk1:127 gk2:133 gn2:64 gn3:135 gnt:68 gpt:165 grn:259 gs1:40 gtc:249 gvl:63
h09:41 h17:4 h1r:40 h2r:16 hho:23 hml:140 hob:321 hoc:158 hop:169 hou:199 ice:383 iko:274 ima:249 inr:495
inv:350 isd:264 itp:67 j12:9 j13:9 j14:14 j15:8 j16:8 j17:9 j18:8 j19:8 j20:10 j22:51 j25:779 jgp:3 jmp:496
jou:165 jp1:5 jtla:46 jud:143 jvc:62 khc:119 khm:407 kld:264 ktk:269 l12:2 l13:4 l14:4 l15:1 l16:1 l17:1
lcc:370 lci:415 lea:295 leb:302 leg:310 lgn:145 lmar:8 lrw:301 ltc:591 ltr:854 m10:249 m11:249 m12:249 m13:249
m14:249 m15:269 m19:280 m20:345 m21:274 m3c:398 macr:3 mafr:5 mar:100 mat:230 mb2:385 mbc:80 mbro:3 mbs:155
mclb:3 md1:26 mdmu:3 med:24 mgb:10 mh1:254 mh2:303 mh3:524 mic:38 mid:277 mir:353 mkc:358 mkhm:5 mkm:451
mltr:1 mm2:249 mm3:249 mma:229 mmh2:5 mmid:3 mmq:350 mneo:3 moc:450 mom:387 mone:5 mor:150 mp2:54 mpr:8 mps:54
mrd:306 msc:866 msh:453 msnc:3 mstx:5 mul:260 mvow:3 mznr:5 ncc:93 nec:38 nem:143 neo:302 nph:175 o90p:10
oafc:4 oafr:3 oarc:45 oc13:15 oc14:5 oc15:5 oc16:5 oc17:4 oc18:4 oc19:4 oc20:5 oc21:5 oclb:1 ocm1:10 ocmd:15
ody:350 oe01:20 ogw:184 ohop:40 olep:83 olgc:27 omic:2 onc:28 one:271 ons:350 opc2:40 opca:86 ori:272 otc:342
otj:374 otp:80 ovnt:35 ovoc:6 p02:165 p03:7 p04:6 p05:6 p06:7 p07:7 p08:7 p09:13 p10:13 p10e:3 p11:7 p15a:2
p22:10 p23:10 p2hg:1 p30a:30 p30h:10 p30m:5 p30t:2 p5dn:1 p8ed:1 p9ed:2 paer:65 pafr:241 pakh:77 pal00:11
pal01:12 pal02:5 pal03:8 pal04:14 pal05:8 pal06:9 pal99:10 pala:2 palp:15 papc:1 parb:3 parl:7 pavr:6 pbbd:22
pbfz:90 pbig:14 pblb:160 pbng:9 pbok:2 pbro:171 pc2:156 pca:156 pcbb:5 pcel:9 pchk:1 pclb:104 pcmd:5 pcmp:12
pcmr:6 pcns:1 pcon:2 pcsp:2 pcy:143 pd2:34 pd3:30 pdft:160 pdgm:6 pdis:2 pdka:5 pdmu:161 pdom:118 pdp10:2
pdp12:3 pdp13:3 pdp14:3 pdp15:2 pdrc:1 pdsk:160 pdst:1 pdtk:51 pdtp:1 pecl:80 peld:138 pelp:15 pemn:77
peoe:160 peve:2 pewk:10 pexo:1 pf19:7 pf20:6 pf23:4 pf24:2 pf25:19 pf26:13 pf27:1 pfdn:106 pfin:94 pfra:0
pfrf:43 pfut:2 pgpt:2 pgpx:20 pgrn:84 pgru:5 pgtc:10 ph17:3 ph18:5 ph19:7 ph20:3 ph21:4 ph22:5 ph23:2 phel:6
phop:1 phou:62 phpr:5 phtr:3 phuk:60 pidw:17 piko:137 pinv:1 pip:1068 pisd:5 pj21:10 pjas:6 pjjt:12 pjou:10
pjsc:4 pjse:8 pjud:1 pkhm:158 pkld:83 pktk:56 pl21:6 pl22:5 pl23:6 pl24:7 pl25:6 pl26:5 plc:165 plci:136
plg20:2 plg21:11 plg22:2 plg24:7 plg25:2 plgm:2 plgn:1 plny:1 plrw:3 pls:143 plst:5663 pltc:4 pltr:86 pm10:3
pm11:6 pm12:3 pm13:6 pm14:6 pm15:14 pm19:95 pm20:144 pm21:137 pmat:8 pmbs:4 pmda:4 pmei:112 pmh1:2 pmh2:86
pmh3:92 pmic:1 pmid:155 pmkm:180 pmmq:1 pmom:134 pmor:2 pmps:20 pmps06:5 pmps07:5 pmps08:6 pmps09:5 pmps10:5
pmps11:5 pmrd:1 pnat:1 pncc:75 pnem:1 pneo:148 pnph:4 pody:1 pogw:65 pone:160 pons:1 por:257 pori:54 potj:160
ppc1:2 ppcy:1 pplc:2 ppls:1 ppp1:5 ppro:18 pptk:2 pr2:6 pr23:3 prav:2 prcq:3 pred:1 prix:98 prna:81 proe:4
prtr:10 prw2:10 prwk:10 ps11:224 ps14:6 ps15:5 ps16:5 ps17:6 ps18:5 ps19:5 psal:720 pscg:1 psdc:5 pshm:2
psnc:161 psoi:90 psok:2 psom:4 psos:80 pspl:13 pspm:68 pss1:5 pss2:5 pss3:5 pss4:5 pss5:2 pssc:10 psth:1
pstx:164 psus:18 psvc:3 ptbro:3 ptc:308 ptdm:160 ptdmu:3 ptg:3 pthb:137 pths:10 ptk:180 ptkdf:4 ptla:80 ptmp:1
ptor:3 ptsnc:6 ptsp:3 ptsr:3 puds:1 pulg:2 puma:40 punh:1 punk:52 purl:18 pusg:1 pust:1 pvan:32 pvow:121
pw11:3 pw12:3 pw21:6 pw22:6 pw23:11 pw24:18 pw25:16 pw26:23 pwar:176 pwcs:46 pwoe:160 pwor:2 pwos:1 pwwk:6
pxln:120 pxtc:10 pza:20 pzen:5 pznr:153 q06:10 q07:1 rav:306 ren:122 rex:45 rfin:2 rin:69 rix:196 rna:259
roe:248 rqs:65 rtr:274 rvr:531 s00:20 s99:173 sbro:1 scd:352 scg:143 sch:53 sds:1 shm:301 skhm:9 slc:84 slci:1
sld:2774 slp:54 slu:16 slx:30 slz:363 smh3:1 smid:9 smom:1 snc:281 sneo:9 soa:195 soc:426 soi:297 sok:165
som:249 sos:368 spe:26 spg:175 spm:286 ss1:9 ss2:8 ss3:8 sstx:9 sta:63 sth:143 stx:275 sum:306 sunf:48 svow:9
sznr:9 t10e:6 t2x2:24 t2xm:31 t30a:16 t40k:23 ta25:16 tacr:8 taer:4 tafc:13 tafr:19 takh:26 tala:10 tarb:4
tavr:8 tbbd:8 tbfz:14 tbig:7 tblb:30 tblc:41 tbng:11 tbot:2 tbrc:14 tbro:12 tbth:15 tc14:36 tc15:25 tc16:21
tc17:11 tc18:26 tc19:29 tc20:20 tc21:30 tclb:20 tcm2:19 tcma:20 tcmm:81 tcmr:23 tcn2:12 tcns:9 tcon:2 tdag:15
tdc:413 tdd1:3 tdd2:1 tddc:3 tddd:3 tdde:3 tddf:1 tddg:1 tddh:2 tddi:2 tddj:1 tddk:1 tddl:2 tddm:1 tdds:7
tddt:3 tddu:4 tdft:14 tdgm:1 tdka:4 tdm:426 tdmc:12 tdmr:14 tdmu:26 tdom:16 tdrc:17 tdsc:23 tdsk:19 tdtk:8
tdvd:3 te01:5 tecc:13 tecl:13 teld:20 tema:16 temn:11 teoc:16 teoe:12 teve:7 tevg:3 tfdc:17 tfdn:33 tfic:11
tfin:37 tfra:18 tfrc:17 tfrf:4 tfth:15 tgk1:10 tgk2:9 tgn2:3 tgn3:10 tgrn:8 tgtc:8 tgvl:4 thb:358 thob:15
thou:13 thp1:7 thp2:7 thp3:8 ths:249 tiko:14 tima:7 tinr:27 tisd:13 tjou:6 tjvc:1 tkhc:8 tkhm:23 tkld:13
tktk:13 tla:394 tlcc:18 tlci:19 tle:317 tlrw:11 tltc:15 tltr:25 tm10:8 tm11:6 tm12:7 tm13:11 tm14:13 tm15:14
tm19:18 tm20:12 tm21:18 tm3c:28 tmbs:6 tmc:132 tmd1:4 tmed:16 tmh1:21 tmh2:21 tmh3:43 tmic:11 tmid:19 tmkc:31
tmkm:22 tmm2:16 tmm3:21 tmma:16 tmoc:46 tmom:23 tmor:3 tmp:350 tmsc:32 tmsh:27 tmt:320 tmul:2 tncc:36 tnec:12
tneo:19 tnph:5 togw:11 tonc:23 tone:14 tor:143 tori:15 totc:41 totj:19 totp:5 tpca:19 tpip:22 trc:41 trex:2
trix:7 trk:135 trna:13 troe:7 trtr:12 trvr:20 tsb:121 tscd:27 tshm:12 tsnc:17 tsoc:30 tsoi:20 tsom:10 tsos:14
tsp:301 tspm:7 tsr:411 tstx:9 ttdc:34 ttdm:16 tthb:14 tths:11 ttla:22 ttle:2 ttmc:31 ttmt:10 ttrk:1 ttsr:15
tugl:6 tuma:16 tund:6 tunf:244 tust:20 tvoc:6 tvow:21 twar:19 twho:64 twoc:10 twoe:18 twwk:6 txln:11 tzen:11
tznc:11 tznr:12 uds:143 ugin:26 ugl:88 ulg:143 ulst:62 uma:254 und:96 unf:244 unh:141 unk:512 usg:350 ust:268
v09:15 v10:15 v11:15 v12:15 v13:20 v14:15 v15:15 v16:15 v17:15 vis:167 voc:38 vow:277 w16:16 w17:30 war:311
wc00:117 wc01:138 wc02:153 wc03:142 wc04:103 wc97:131 wc98:117 wc99:111 wdmu:5 wfin:3 who:1178 wmc:5 wmkm:4
wmom:12 woc:173 woe:381 wone:6 wot:103 wth:167 wwk:145 wwoe:6 xln:279 zen:249 znc:142 zne:30 znr:280
`.trim().split(/\s+/).map((entry) => {
	const [code, size] = entry.split(":");
	return [code, Number(size)];
}));
