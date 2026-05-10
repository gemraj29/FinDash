/**
 * FinDash — Prisma Seed Script
 * Generates two realistic portfolios with trade history, FIFO tax lots,
 * ledger entries, and price snapshots so you can see the full UI.
 *
 * Run:  npx prisma db seed
 *    or yarn workspace @findash/api prisma:seed
 */

import { PrismaClient, TradeDirection, AssetClass, TaxMethod, HoldingPeriod } from '@prisma/client';

const prisma = new PrismaClient();

// ─── helpers ────────────────────────────────────────────────────────────────
const cents = (dollars: number) => Math.round(dollars * 100);
const uuid  = () => crypto.randomUUID();
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

// ─── seed data ──────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱  Seeding FinDash database…\n');

  // ── wipe existing seed data (idempotent re-runs) ────────────────────────
  await prisma.ledgerEntry.deleteMany();
  await prisma.taxLot.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.position.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.portfolio.deleteMany();
  console.log('  ✓ Cleared previous seed data');

  // ═══════════════════════════════════════════════════════════════════════
  // PORTFOLIO 1 — Tech Growth
  // Holdings: AAPL · MSFT · NVDA · GOOGL
  // ═══════════════════════════════════════════════════════════════════════
  const p1 = await prisma.portfolio.create({
    data: {
      id: 'portfolio-tech-growth',
      name: 'Tech Growth',
      description: 'Concentrated US tech equities — long-term capital appreciation',
      currency: 'USD',
      taxMethod: TaxMethod.FIFO,
    },
  });
  console.log(`\n  ✓ Portfolio 1: ${p1.name}`);

  // ── AAPL ────────────────────────────────────────────────────────────────
  //   BUY  50 @ $165  (day -400)  → lot 1
  //   BUY  25 @ $150  (day -220)  → lot 2
  //   SELL 30 @ $185  (day -60)   → consumes lot 1 (20 remain), lot 2 intact
  //   Net position: 45 shares  avg cost ≈ $156.67 (15667 ¢)
  {
    const aaplPos = await prisma.position.create({
      data: {
        portfolioId: p1.id,
        symbol: 'AAPL',
        assetClass: AssetClass.EQUITY,
        sharesHeld: 45,
        avgCostBasisCents: 15667,
        openedAt: daysAgo(400),
      },
    });

    // Lot 1: 50 bought, 20 remaining after SELL
    const lot1 = await prisma.taxLot.create({
      data: {
        positionId: aaplPos.id,
        portfolioId: p1.id,
        symbol: 'AAPL',
        sharesAcquired: 50,
        sharesRemaining: 20,
        costBasisPerShareCents: cents(165),
        acquiredAt: daysAgo(400),
        holdingPeriod: HoldingPeriod.LONG_TERM,
      },
    });

    // Lot 2: 25 bought, all remaining
    const lot2 = await prisma.taxLot.create({
      data: {
        positionId: aaplPos.id,
        portfolioId: p1.id,
        symbol: 'AAPL',
        sharesAcquired: 25,
        sharesRemaining: 25,
        costBasisPerShareCents: cents(150),
        acquiredAt: daysAgo(220),
        holdingPeriod: HoldingPeriod.LONG_TERM,
      },
    });

    const buy1Id = uuid();
    const buy2Id = uuid();
    const sell1Id = uuid();

    await prisma.trade.createMany({
      data: [
        {
          id: buy1Id,
          portfolioId: p1.id,
          positionId: aaplPos.id,
          symbol: 'AAPL',
          direction: TradeDirection.BUY,
          shares: 50,
          pricePerShareCents: cents(165),
          commissionCents: cents(0.99),
          notionalCents: 50 * cents(165),
          idempotencyKey: 'seed-aapl-buy-1',
          executedAt: daysAgo(400),
        },
        {
          id: buy2Id,
          portfolioId: p1.id,
          positionId: aaplPos.id,
          symbol: 'AAPL',
          direction: TradeDirection.BUY,
          shares: 25,
          pricePerShareCents: cents(150),
          commissionCents: cents(0.99),
          notionalCents: 25 * cents(150),
          idempotencyKey: 'seed-aapl-buy-2',
          executedAt: daysAgo(220),
        },
        {
          id: sell1Id,
          portfolioId: p1.id,
          positionId: aaplPos.id,
          symbol: 'AAPL',
          direction: TradeDirection.SELL,
          shares: 30,
          pricePerShareCents: cents(185),
          commissionCents: cents(0.99),
          notionalCents: 30 * cents(185),
          idempotencyKey: 'seed-aapl-sell-1',
          executedAt: daysAgo(60),
        },
      ],
    });

    await prisma.ledgerEntry.createMany({
      data: [
        { portfolioId: p1.id, entryType: 'TRADE', amountCents: -(50 * cents(165)), description: 'BUY 50 AAPL @ $165.00', referenceId: buy1Id, createdAt: daysAgo(400) },
        { portfolioId: p1.id, entryType: 'COMMISSION', amountCents: -99, description: 'Commission: BUY AAPL', referenceId: buy1Id, createdAt: daysAgo(400) },
        { portfolioId: p1.id, entryType: 'TRADE', amountCents: -(25 * cents(150)), description: 'BUY 25 AAPL @ $150.00', referenceId: buy2Id, createdAt: daysAgo(220) },
        { portfolioId: p1.id, entryType: 'COMMISSION', amountCents: -99, description: 'Commission: BUY AAPL', referenceId: buy2Id, createdAt: daysAgo(220) },
        { portfolioId: p1.id, entryType: 'TRADE', amountCents: 30 * cents(185), description: 'SELL 30 AAPL @ $185.00', referenceId: sell1Id, createdAt: daysAgo(60) },
        { portfolioId: p1.id, entryType: 'COMMISSION', amountCents: -99, description: 'Commission: SELL AAPL', referenceId: sell1Id, createdAt: daysAgo(60) },
      ],
    });
    console.log('    ✓ AAPL: 45 shares (2 lots, 1 partial sell)');
  }

  // ── MSFT ────────────────────────────────────────────────────────────────
  //   BUY  20 @ $280  (day -350)  → lot 1
  //   BUY  15 @ $310  (day -180)  → lot 2
  //   SELL 10 @ $340  (day -30)   → consumes 10 from lot 1 (10 remain)
  //   Net: 25 shares  avg cost ≈ $298 (29800 ¢)
  {
    const msftPos = await prisma.position.create({
      data: {
        portfolioId: p1.id,
        symbol: 'MSFT',
        assetClass: AssetClass.EQUITY,
        sharesHeld: 25,
        avgCostBasisCents: cents(298),
        openedAt: daysAgo(350),
      },
    });

    await prisma.taxLot.createMany({
      data: [
        {
          positionId: msftPos.id, portfolioId: p1.id, symbol: 'MSFT',
          sharesAcquired: 20, sharesRemaining: 10,
          costBasisPerShareCents: cents(280),
          acquiredAt: daysAgo(350), holdingPeriod: HoldingPeriod.LONG_TERM,
        },
        {
          positionId: msftPos.id, portfolioId: p1.id, symbol: 'MSFT',
          sharesAcquired: 15, sharesRemaining: 15,
          costBasisPerShareCents: cents(310),
          acquiredAt: daysAgo(180), holdingPeriod: HoldingPeriod.SHORT_TERM,
        },
      ],
    });

    const b1 = uuid(), b2 = uuid(), s1 = uuid();
    await prisma.trade.createMany({
      data: [
        { id: b1, portfolioId: p1.id, positionId: msftPos.id, symbol: 'MSFT', direction: TradeDirection.BUY,  shares: 20, pricePerShareCents: cents(280), commissionCents: 99, notionalCents: 20 * cents(280), idempotencyKey: 'seed-msft-buy-1', executedAt: daysAgo(350) },
        { id: b2, portfolioId: p1.id, positionId: msftPos.id, symbol: 'MSFT', direction: TradeDirection.BUY,  shares: 15, pricePerShareCents: cents(310), commissionCents: 99, notionalCents: 15 * cents(310), idempotencyKey: 'seed-msft-buy-2', executedAt: daysAgo(180) },
        { id: s1, portfolioId: p1.id, positionId: msftPos.id, symbol: 'MSFT', direction: TradeDirection.SELL, shares: 10, pricePerShareCents: cents(340), commissionCents: 99, notionalCents: 10 * cents(340), idempotencyKey: 'seed-msft-sell-1', executedAt: daysAgo(30) },
      ],
    });
    await prisma.ledgerEntry.createMany({
      data: [
        { portfolioId: p1.id, entryType: 'TRADE', amountCents: -(20 * cents(280)), description: 'BUY 20 MSFT @ $280.00', referenceId: b1, createdAt: daysAgo(350) },
        { portfolioId: p1.id, entryType: 'TRADE', amountCents: -(15 * cents(310)), description: 'BUY 15 MSFT @ $310.00', referenceId: b2, createdAt: daysAgo(180) },
        { portfolioId: p1.id, entryType: 'TRADE', amountCents: 10 * cents(340), description: 'SELL 10 MSFT @ $340.00', referenceId: s1, createdAt: daysAgo(30) },
      ],
    });
    console.log('    ✓ MSFT: 25 shares (2 lots, 1 partial sell)');
  }

  // ── NVDA ────────────────────────────────────────────────────────────────
  //   BUY 10 @ $450  (day -800) → long-term hold, huge unrealized gain
  {
    const nvdaPos = await prisma.position.create({
      data: {
        portfolioId: p1.id,
        symbol: 'NVDA',
        assetClass: AssetClass.EQUITY,
        sharesHeld: 10,
        avgCostBasisCents: cents(450),
        openedAt: daysAgo(800),
      },
    });
    await prisma.taxLot.create({
      data: {
        positionId: nvdaPos.id, portfolioId: p1.id, symbol: 'NVDA',
        sharesAcquired: 10, sharesRemaining: 10,
        costBasisPerShareCents: cents(450),
        acquiredAt: daysAgo(800), holdingPeriod: HoldingPeriod.LONG_TERM,
      },
    });
    const b1 = uuid();
    await prisma.trade.create({ data: { id: b1, portfolioId: p1.id, positionId: nvdaPos.id, symbol: 'NVDA', direction: TradeDirection.BUY, shares: 10, pricePerShareCents: cents(450), commissionCents: 99, notionalCents: 10 * cents(450), idempotencyKey: 'seed-nvda-buy-1', executedAt: daysAgo(800) } });
    await prisma.ledgerEntry.create({ data: { portfolioId: p1.id, entryType: 'TRADE', amountCents: -(10 * cents(450)), description: 'BUY 10 NVDA @ $450.00', referenceId: b1, createdAt: daysAgo(800) } });
    console.log('    ✓ NVDA: 10 shares (long-term, +38% unrealized gain)');
  }

  // ── GOOGL ───────────────────────────────────────────────────────────────
  //   BUY 8 @ $135  (day -45) → recent position
  {
    const googlPos = await prisma.position.create({
      data: {
        portfolioId: p1.id,
        symbol: 'GOOGL',
        assetClass: AssetClass.EQUITY,
        sharesHeld: 8,
        avgCostBasisCents: cents(135),
        openedAt: daysAgo(45),
      },
    });
    await prisma.taxLot.create({
      data: {
        positionId: googlPos.id, portfolioId: p1.id, symbol: 'GOOGL',
        sharesAcquired: 8, sharesRemaining: 8,
        costBasisPerShareCents: cents(135),
        acquiredAt: daysAgo(45), holdingPeriod: HoldingPeriod.SHORT_TERM,
      },
    });
    const b1 = uuid();
    await prisma.trade.create({ data: { id: b1, portfolioId: p1.id, positionId: googlPos.id, symbol: 'GOOGL', direction: TradeDirection.BUY, shares: 8, pricePerShareCents: cents(135), commissionCents: 99, notionalCents: 8 * cents(135), idempotencyKey: 'seed-googl-buy-1', executedAt: daysAgo(45) } });
    await prisma.ledgerEntry.create({ data: { portfolioId: p1.id, entryType: 'TRADE', amountCents: -(8 * cents(135)), description: 'BUY 8 GOOGL @ $135.00', referenceId: b1, createdAt: daysAgo(45) } });
    console.log('    ✓ GOOGL: 8 shares (recent, short-term)');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PORTFOLIO 2 — ETF Core
  // Holdings: SPY · QQQ · BND
  // ═══════════════════════════════════════════════════════════════════════
  const p2 = await prisma.portfolio.create({
    data: {
      id: 'portfolio-etf-core',
      name: 'ETF Core',
      description: 'Passive index ETF strategy — broad market + bonds',
      currency: 'USD',
      taxMethod: TaxMethod.FIFO,
    },
  });
  console.log(`\n  ✓ Portfolio 2: ${p2.name}`);

  // ── SPY ─────────────────────────────────────────────────────────────────
  {
    const spyPos = await prisma.position.create({
      data: { portfolioId: p2.id, symbol: 'SPY', assetClass: AssetClass.ETF, sharesHeld: 15, avgCostBasisCents: cents(440), openedAt: daysAgo(300) },
    });
    await prisma.taxLot.create({
      data: { positionId: spyPos.id, portfolioId: p2.id, symbol: 'SPY', sharesAcquired: 15, sharesRemaining: 15, costBasisPerShareCents: cents(440), acquiredAt: daysAgo(300), holdingPeriod: HoldingPeriod.SHORT_TERM },
    });
    const b1 = uuid();
    await prisma.trade.create({ data: { id: b1, portfolioId: p2.id, positionId: spyPos.id, symbol: 'SPY', direction: TradeDirection.BUY, shares: 15, pricePerShareCents: cents(440), commissionCents: 0, notionalCents: 15 * cents(440), idempotencyKey: 'seed-spy-buy-1', executedAt: daysAgo(300) } });
    await prisma.ledgerEntry.create({ data: { portfolioId: p2.id, entryType: 'TRADE', amountCents: -(15 * cents(440)), description: 'BUY 15 SPY @ $440.00', referenceId: b1, createdAt: daysAgo(300) } });
    console.log('    ✓ SPY: 15 shares');
  }

  // ── QQQ ─────────────────────────────────────────────────────────────────
  {
    const qqqPos = await prisma.position.create({
      data: { portfolioId: p2.id, symbol: 'QQQ', assetClass: AssetClass.ETF, sharesHeld: 10, avgCostBasisCents: cents(370), openedAt: daysAgo(250) },
    });
    await prisma.taxLot.create({
      data: { positionId: qqqPos.id, portfolioId: p2.id, symbol: 'QQQ', sharesAcquired: 10, sharesRemaining: 10, costBasisPerShareCents: cents(370), acquiredAt: daysAgo(250), holdingPeriod: HoldingPeriod.SHORT_TERM },
    });
    const b1 = uuid();
    await prisma.trade.create({ data: { id: b1, portfolioId: p2.id, positionId: qqqPos.id, symbol: 'QQQ', direction: TradeDirection.BUY, shares: 10, pricePerShareCents: cents(370), commissionCents: 0, notionalCents: 10 * cents(370), idempotencyKey: 'seed-qqq-buy-1', executedAt: daysAgo(250) } });
    await prisma.ledgerEntry.create({ data: { portfolioId: p2.id, entryType: 'TRADE', amountCents: -(10 * cents(370)), description: 'BUY 10 QQQ @ $370.00', referenceId: b1, createdAt: daysAgo(250) } });
    console.log('    ✓ QQQ: 10 shares');
  }

  // ── BND ──────────────────────────────────────────────────────────────────
  {
    const bndPos = await prisma.position.create({
      data: { portfolioId: p2.id, symbol: 'BND', assetClass: AssetClass.FIXED_INCOME, sharesHeld: 50, avgCostBasisCents: cents(73.5), openedAt: daysAgo(500) },
    });
    await prisma.taxLot.create({
      data: { positionId: bndPos.id, portfolioId: p2.id, symbol: 'BND', sharesAcquired: 50, sharesRemaining: 50, costBasisPerShareCents: cents(73.5), acquiredAt: daysAgo(500), holdingPeriod: HoldingPeriod.LONG_TERM },
    });
    const b1 = uuid();
    await prisma.trade.create({ data: { id: b1, portfolioId: p2.id, positionId: bndPos.id, symbol: 'BND', direction: TradeDirection.BUY, shares: 50, pricePerShareCents: cents(73.5), commissionCents: 0, notionalCents: 50 * cents(73.5), idempotencyKey: 'seed-bnd-buy-1', executedAt: daysAgo(500) } });
    await prisma.ledgerEntry.create({ data: { portfolioId: p2.id, entryType: 'TRADE', amountCents: -(50 * cents(73.5)), description: 'BUY 50 BND @ $73.50', referenceId: b1, createdAt: daysAgo(500) } });
    console.log('    ✓ BND: 50 shares (fixed income)');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRICE SNAPSHOTS — current market prices for the UI
  // ═══════════════════════════════════════════════════════════════════════
  const prices = [
    { symbol: 'AAPL',  priceCents: cents(187.50), prevCloseCents: cents(185.00) },
    { symbol: 'MSFT',  priceCents: cents(378.40), prevCloseCents: cents(371.20) },
    { symbol: 'NVDA',  priceCents: cents(621.30), prevCloseCents: cents(618.50) },
    { symbol: 'GOOGL', priceCents: cents(142.80), prevCloseCents: cents(141.00) },
    { symbol: 'SPY',   priceCents: cents(476.20), prevCloseCents: cents(473.00) },
    { symbol: 'QQQ',   priceCents: cents(416.90), prevCloseCents: cents(413.00) },
    { symbol: 'BND',   priceCents: cents(72.80),  prevCloseCents: cents(73.10)  },
  ];

  await prisma.priceSnapshot.createMany({ data: prices });
  console.log(`\n  ✓ Price snapshots: ${prices.map(p => p.symbol).join(' · ')}`);

  // ─── summary ─────────────────────────────────────────────────────────────
  console.log(`
╔═══════════════════════════════════════════════╗
║          FinDash Seed Complete ✅              ║
╠═══════════════════════════════════════════════╣
║  Portfolios  : 2  (Tech Growth, ETF Core)     ║
║  Positions   : 7  (AAPL MSFT NVDA GOOGL       ║
║                    SPY QQQ BND)               ║
║  Tax Lots    : 8  (FIFO, mix of ST/LT)        ║
║  Trades      : 10 (7 buys · 3 sells)          ║
║  Ledger rows : 13                             ║
║  Price snaps : 7                              ║
╚═══════════════════════════════════════════════╝

  → Dashboard:  http://localhost:3000
  → API:        http://localhost:3001
`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
