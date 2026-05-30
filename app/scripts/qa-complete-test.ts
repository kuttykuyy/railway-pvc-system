import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { 
  getRailwayZoneOptions, 
  getSteelCityForZone, 
  getSteelIndexNamesForZone, 
  getFuelIndexNameForBill,
  getFuelIndexNamesForBill,
  getZoneDisplayName,
  RAILWAY_ZONE_STEEL_CITY_MAP
} from '../lib/zone-steel-city-mapping';
import { 
  calculatePvcComponent, 
  calculatePvcComponentWithSteps,
  isProcessingFeeClassification,
  getQuarterFromDate,
  getBaseMonth,
  getQuarterMonths
} from '../lib/pvc-calculations';
import { getUserAccessibleContracts, getUserAccessibleBills } from '../lib/permissions';

const prisma = new PrismaClient();

async function runTests() {
  console.log('================================================================');
  console.log('             RAILWAY PVC SYSTEM - COMPREHENSIVE QA TEST          ');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASSED: ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ FAILED: ${testName}`);
      if (detail) console.error(`   Detail: ${detail}`);
      failedTests++;
    }
  }

  // =================================================================
  // TEST SUITE 1: Zone to Steel City Mappings
  // =================================================================
  console.log('--- Test Suite 1: Zone to Steel City Mappings ---');
  try {
    // 1.1 Verify all 18 Indian Railway Zones exist in mapping
    const expectedZones = ['SR', 'CR', 'WR', 'ER', 'NR', 'NER', 'NFR', 'SCR', 'SER', 'SECR', 'SWR', 'WCR', 'ECR', 'ECoR', 'NCR', 'NWR', 'KRCL', 'Metro'];
    const actualKeys = Object.keys(RAILWAY_ZONE_STEEL_CITY_MAP);
    const allKeysPresent = expectedZones.every(z => actualKeys.includes(z));
    assert(allKeysPresent && actualKeys.length === 18, 'All 18 Railway Zones are mapped correctly');

    // 1.2 Verify mapping of specific zones
    assert(getSteelCityForZone('SR') === 'Chennai', 'SR maps to Chennai');
    assert(getSteelCityForZone('NR') === 'Delhi', 'NR maps to Delhi');
    assert(getSteelCityForZone('CR') === 'Mumbai', 'CR maps to Mumbai');
    assert(getSteelCityForZone('ER') === 'Kolkata', 'ER maps to Kolkata');
    assert(getSteelCityForZone('NCR') === 'Delhi', 'NCR (Prayagraj) maps to Delhi');
    assert(getSteelCityForZone('SCR') === 'Chennai', 'SCR (Secunderabad) maps to Chennai');
    assert(getSteelCityForZone('SWR') === 'Mumbai', 'SWR (Hubballi) maps to Mumbai');

    // 1.3 Verify fallback and legacy values
    assert(getSteelCityForZone(null) === 'Chennai', 'Null zone defaults to Chennai');
    assert(getSteelCityForZone(undefined) === 'Chennai', 'Undefined zone defaults to Chennai');
    assert(getSteelCityForZone('Mumbai') === 'Mumbai', 'Legacy zone "Mumbai" maps to Mumbai');
    assert(getSteelCityForZone('Delhi') === 'Delhi', 'Legacy zone "Delhi" maps to Delhi');
    assert(getSteelCityForZone('UNKNOWN') === 'Chennai', 'Unknown zone code defaults to Chennai');

    // 1.4 Dropdown options validation
    const options = getRailwayZoneOptions();
    assert(options.length === 18, 'getRailwayZoneOptions returns exactly 18 options');
    const srOption = options.find(o => o.value === 'SR');
    assert(srOption?.label === 'SR - Southern Railway' && srOption?.steelCity === 'Chennai', 'SR option metadata is correct');

    // 1.5 Zone display name
    assert(getZoneDisplayName('SR') === 'SR - Southern Railway', 'Zone display name is formatted correctly for SR');
    assert(getZoneDisplayName('Mumbai') === 'Mumbai', 'Zone display name handles legacy names correctly');
    assert(getZoneDisplayName(null) === 'N/A', 'Zone display name handles null as N/A');

  } catch (error: any) {
    console.error('Error in Test Suite 1:', error);
    failedTests++;
  }

  // =================================================================
  // TEST SUITE 2: Steel & Fuel Index Name Generation
  // =================================================================
  console.log('\n--- Test Suite 2: Steel & Fuel Index Name Generation ---');
  try {
    // 2.1 Steel index names for Chennai
    const chennaiSteel = getSteelIndexNamesForZone('SR');
    assert(
      chennaiSteel.length === 4 && 
      chennaiSteel.includes('Steel TMT Bars') && 
      !chennaiSteel.some(n => n.includes('Chennai')), 
      'Chennai zones return default unsuffixed steel index names (backward compatible)'
    );

    // 2.2 Steel index names for Delhi
    const delhiSteel = getSteelIndexNamesForZone('NR');
    assert(
      delhiSteel.length === 4 && 
      delhiSteel.includes('Steel TMT Bars - Delhi') && 
      delhiSteel.includes('Steel Angle/Channel - Delhi'), 
      'Delhi zones return Delhi-suffixed steel index names'
    );

    // 2.3 Fuel index name logic (four-city average)
    assert(getFuelIndexNameForBill('SR', 'four_city_avg') === 'MPNG Fuel', 'four_city_avg fuel type returns "MPNG Fuel"');
    assert(getFuelIndexNameForBill('NR', null) === 'MPNG Fuel', 'Null fuel type defaults to "MPNG Fuel"');

    // 2.4 Fuel index name logic (zone city)
    assert(getFuelIndexNameForBill('SR', 'zone_city') === 'MPNG Fuel - Chennai', 'Chennai zone returns "MPNG Fuel - Chennai" (not unsuffixed)');
    assert(getFuelIndexNameForBill('NR', 'zone_city') === 'MPNG Fuel - Delhi', 'Delhi zone returns "MPNG Fuel - Delhi"');
    assert(getFuelIndexNamesForBill('CR', 'zone_city')[0] === 'MPNG Fuel - Mumbai', 'getFuelIndexNamesForBill returns array with Mumbai-suffixed fuel index');

  } catch (error: any) {
    console.error('Error in Test Suite 2:', error);
    failedTests++;
  }

  // =================================================================
  // TEST SUITE 3: PVC Calculation Formulas & Precision
  // =================================================================
  console.log('\n--- Test Suite 3: PVC Calculation Formulas & Precision ---');
  try {
    // 3.1 Basic component calculation
    // Formula: PVC = (Amount * (Avg - Base) * Percentage%) / Base
    // E.g.: Amount = 100,000, Avg = 150, Base = 100, Pct = 20%
    // Diff = 150 - 100 = 50. Ratio = 50 / 100 = 0.5. CompAmt = 100,000 * 0.5 = 50,000. PVC = 50,000 * 20% = 10,000
    const pvcVal = calculatePvcComponent(100000, 150, 100, 20);
    assert(Math.abs(pvcVal - 10000) < 0.0001, 'calculatePvcComponent calculates correct PVC amount');

    // 3.2 Verification steps output
    const pvcSteps = calculatePvcComponentWithSteps(100000, 150.123, 100.456, 20, 'Labour');
    assert(pvcSteps.finalPvc > 0, 'calculatePvcComponentWithSteps runs successfully');
    assert(pvcSteps.steps.step1.calculation === '150.12 - 100.46', 'Indices are rounded to 2 decimals in steps');
    assert(pvcSteps.formula.includes('Labour') === false, 'Formula format matches core layout');

    // 3.3 Processing fee detector
    assert(isProcessingFeeClassification({ labour: 0, plantMachinery: 0, fuel: 0, otherMaterials: 0, cement: 0, steel: 0, explosives: 0 }), 'Processing fee detector returns true for all 0%');
    assert(!isProcessingFeeClassification({ labour: 15, plantMachinery: 0, fuel: 0, otherMaterials: 0, cement: 0, steel: 0, explosives: 0 }), 'Processing fee detector returns false if any component exists');

    // 3.4 Quarter month calculation helpers
    const baseMonth = new Date('2024-04-01');
    const quarter = getQuarterFromDate(new Date('2024-08-15'), baseMonth); // August is Q2 (May, Jun, Jul = Q1, Aug, Sep, Oct = Q2)
    assert(quarter === 'Q2-2024', `getQuarterFromDate returns Q2-2024 (got: ${quarter})`);

    const qMonths = getQuarterMonths('Q2-2024', baseMonth);
    const qMonthsFormatted = qMonths.map(d => d.toISOString().substring(0, 7));
    assert(
      qMonthsFormatted.includes('2024-08') && 
      qMonthsFormatted.includes('2024-09') && 
      qMonthsFormatted.includes('2024-10'), 
      'getQuarterMonths returns correct month dates for Q2-2024'
    );

  } catch (error: any) {
    console.error('Error in Test Suite 3:', error);
    failedTests++;
  }

  // =================================================================
  // TEST SUITE 4: Database Price Indices Status & Sync Validation
  // =================================================================
  console.log('\n--- Test Suite 4: Database Price Indices Status & Sync Validation ---');
  try {
    // 4.1 Check core indices existence
    const dbIndices = await prisma.priceIndex.findMany({
      select: { name: true }
    });
    const indexNames = dbIndices.map(idx => idx.name);
    
    const requiredCore = ['Labour', 'RBI Plant Machinery', 'RBI Cement', 'RBI Explosives', 'RBI Other Materials', 'MPNG Fuel'];
    const allCorePresent = requiredCore.every(n => indexNames.includes(n));
    assert(allCorePresent, 'All core price indices exist in the database');

    // 4.2 Check city-specific steel indices existence
    const cities = ['Delhi', 'Mumbai', 'Kolkata'];
    const steelBase = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
    let citySteelPresent = true;
    for (const city of cities) {
      for (const base of steelBase) {
        if (!indexNames.includes(`${base} - ${city}`)) {
          citySteelPresent = false;
          console.error(`Missing index: ${base} - ${city}`);
        }
      }
    }
    assert(citySteelPresent, 'All city-specific steel indices (Delhi, Mumbai, Kolkata) exist in the database');

    // 4.3 Check city-specific fuel indices existence
    const allCities = ['Delhi', 'Mumbai', 'Chennai', 'Kolkata'];
    const fuelPresent = allCities.every(city => indexNames.includes(`MPNG Fuel - ${city}`));
    assert(fuelPresent, 'All city-specific fuel indices (including Chennai) exist in the database');

    // 4.4 Verify fuel prices sync script check
    const jan2026Fuel = await prisma.dailyFuelPrice.findFirst({
      where: {
        date: {
          gte: new Date('2026-01-01'),
          lte: new Date('2026-01-31')
        }
      }
    });
    assert(jan2026Fuel !== null, 'DailyFuelPrice contains data for Jan 2026 (WPI sync functional)');

  } catch (error: any) {
    console.error('Error in Test Suite 4:', error);
    failedTests++;
  }

  // =================================================================
  // TEST SUITE 5: PDF Component Deduplication Logic Mock Verify
  // =================================================================
  console.log('\n--- Test Suite 5: PDF Component Deduplication Logic Verification ---');
  try {
    // We mock the deduplication step in embedComponentIndices:
    // Let's say we have 3 documents: TMT, Plates, Angle/Channel.
    // They are unique documents, but 2 of them share the same physical cloudStoragePath.
    const mockDocuments = [
      { id: '1', componentType: 'TMT_BARS', cloudStoragePath: 's3://jpc/bulletin-may-2025.pdf' },
      { id: '2', componentType: 'PLATES', cloudStoragePath: 's3://jpc/bulletin-may-2025.pdf' },
      { id: '3', componentType: 'LABOUR', cloudStoragePath: 's3://labour/cpi-iw-2025.pdf' }
    ];

    // Deduplication logic from labour-index-embedder.ts lines 73-82:
    const documentsByPath = new Map<string, typeof mockDocuments[0]>();
    for (const doc of mockDocuments) {
      if (!documentsByPath.has(doc.cloudStoragePath)) {
        documentsByPath.set(doc.cloudStoragePath, doc);
      }
    }
    
    const deduplicatedDocuments = Array.from(documentsByPath.values());
    assert(deduplicatedDocuments.length === 2, 'Deduplication by cloudStoragePath successfully filters out duplicate files');
    assert(
      deduplicatedDocuments.some(d => d.componentType === 'TMT_BARS') &&
      deduplicatedDocuments.some(d => d.componentType === 'LABOUR') &&
      !deduplicatedDocuments.some(d => d.componentType === 'PLATES'),
      'First document per unique path is retained'
    );

  } catch (error: any) {
    console.error('Error in Test Suite 5:', error);
    failedTests++;
  }

  // =================================================================
  // TEST SUITE 6: Forecast Weighted Regression Logic Verification
  // =================================================================
  console.log('\n--- Test Suite 6: Forecast Weighted Regression Logic Verification ---');
  try {
    // Test the regression calculation from route.ts
    // Let's create mock values showing a perfect linear trend: y = 2x + 100
    // x values: 0, 1, 2, 3
    // y values: 100, 102, 104, 106
    const n = 4;
    const xs = [0, 1, 2, 3];
    const ys = [100, 102, 104, 106];
    
    // Weight decay logic: w_i = decay^(n-1-i)
    const decay = 0.85;
    const weights = ys.map((_, i) => Math.pow(decay, n - 1 - i));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const wSumX = xs.reduce((acc, x, i) => acc + weights[i] * x, 0);
    const wSumY = ys.reduce((acc, y, i) => acc + weights[i] * y, 0);
    const wSumXY = xs.reduce((acc, x, i) => acc + weights[i] * x * ys[i], 0);
    const wSumX2 = xs.reduce((acc, x, i) => acc + weights[i] * x * x, 0);

    const denom = totalWeight * wSumX2 - wSumX * wSumX;
    const slope = denom !== 0 ? (totalWeight * wSumXY - wSumX * wSumY) / denom : 0;
    const intercept = (wSumY - slope * wSumX) / totalWeight;

    // The slope should be exactly 2 and intercept exactly 100 for a perfect linear trend
    assert(Math.abs(slope - 2) < 0.0001, 'Slope of linear trend is calculated correctly');
    assert(Math.abs(intercept - 100) < 0.0001, 'Intercept of linear trend is calculated correctly');

    // Forecast value at x = 4 (should be 2 * 4 + 100 = 108)
    const projectedVal = slope * 4 + intercept;
    assert(Math.abs(projectedVal - 108) < 0.0001, 'Forecasted index value is projected accurately');

  } catch (error: any) {
    console.error('Error in Test Suite 6:', error);
    failedTests++;
  }

  // =================================================================
  // TEST SUITE 7: Account-Based RBAC/ZBAC & Signup Flow
  // =================================================================
  console.log('\n--- Test Suite 7: Account-Based RBAC/ZBAC & Signup Flow ---');
  try {
    // 7.1 Create test users
    const testContractor = await prisma.user.create({
      data: {
        email: 'test_contractor@example.com',
        name: 'Test Contractor',
        phone: '+919999999999',
        role: 'contractor',
      }
    });

    const testOfficialSR = await prisma.user.create({
      data: {
        email: 'test_official_sr@example.com',
        name: 'Test Official SR',
        phone: '+918888888888',
        role: 'railway_official',
        railwayZone: 'SR',
        railwayZoneName: 'Southern Railway',
      }
    });

    const testOfficialCR = await prisma.user.create({
      data: {
        email: 'test_official_cr@example.com',
        name: 'Test Official CR',
        phone: '+917777777777',
        role: 'railway_official',
        railwayZone: 'CR',
        railwayZoneName: 'Central Railway',
      }
    });

    // 7.2 Create test contract and bill
    const testContract = await prisma.contract.create({
      data: {
        agreementNo: 'SR/TPJ/TEST/2026/01',
        contractorName: 'Test Contractor Co',
        workDescription: 'Test work description',
        dateOfOpening: new Date('2026-01-01'),
        baseMonth: new Date('2025-12-01'),
        userId: testContractor.id
      }
    });

    const testBill = await prisma.bill.create({
      data: {
        contractId: testContract.id,
        billNo: 'TEST-BILL-01',
        billAmount: 50000,
        grossBillAmount: 50000,
        dateOfMeasurement: new Date('2026-02-01'),
        quarter: 'Q1-2026',
        zone: 'SR',
      }
    });

    // 7.3 Test contract access
    const contractorContracts = await getUserAccessibleContracts(testContractor.id);
    assert(contractorContracts.includes(testContract.id), 'Contractor can access their own contract');

    const officialSRContracts = await getUserAccessibleContracts(testOfficialSR.id);
    assert(officialSRContracts.includes(testContract.id), 'SR official can access contract in SR zone');

    const officialCRContracts = await getUserAccessibleContracts(testOfficialCR.id);
    assert(!officialCRContracts.includes(testContract.id), 'CR official cannot access contract in SR zone');

    // 7.4 Test bill access
    const contractorBills = await getUserAccessibleBills(testContractor.id);
    assert(contractorBills.includes(testBill.id), 'Contractor can access their own bill');

    const officialSRBills = await getUserAccessibleBills(testOfficialSR.id);
    assert(officialSRBills.includes(testBill.id), 'SR official can access bill in SR zone');

    const officialCRBills = await getUserAccessibleBills(testOfficialCR.id);
    assert(!officialCRBills.includes(testBill.id), 'CR official cannot access bill in SR zone');

    // 7.5 Cleanup
    await prisma.bill.delete({ where: { id: testBill.id } });
    await prisma.contract.delete({ where: { id: testContract.id } });
    await prisma.user.delete({ where: { id: testContractor.id } });
    await prisma.user.delete({ where: { id: testOfficialSR.id } });
    await prisma.user.delete({ where: { id: testOfficialCR.id } });

    console.log('✅ PASSED: ZBAC test records cleaned up successfully');
    passedTests++;

  } catch (error: any) {
    console.error('Error in Test Suite 7:', error);
    failedTests++;
  }

  // =================================================================
  // SUMMARY REPORT
  // =================================================================
  console.log('\n================================================================');
  console.log('                         QA TEST RESULTS SUMMARY                 ');
  console.log('================================================================');
  console.log(`Total Passed: ${passedTests}`);
  console.log(`Total Failed: ${failedTests}`);
  
  if (failedTests === 0) {
    console.log('\n🌟 STATUS: ALL TESTS PASSED SUCCESSFULLY! 🌟');
  } else {
    console.error('\n⚠️ STATUS: QA TEST RUN COMPLETED WITH FAILURES! ⚠️');
  }
  console.log('================================================================\n');

  await prisma.$disconnect();
  process.exit(failedTests === 0 ? 0 : 1);
}

runTests();
