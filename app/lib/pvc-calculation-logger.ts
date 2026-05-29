
/**
 * PVC Calculation Logger
 * Provides detailed logging for PVC calculations during bill creation and editing
 */

interface ComponentCalculation {
  name: string;
  percentage: number;
  baseIndex: number;
  measurementIndex: number;
  variationRatio: number;
  billAmount: number;
  pvcAmount: number;
}

interface SteelCalculation {
  type: string;
  percentage: number;
  baseIndex: number;
  measurementIndex: number;
  variationRatio: number;
  billAmount: number;
  pvcAmount: number;
}

interface DedicatedCalculation {
  type: 'cement' | 'steel';
  baseIndex: number;
  measurementIndex: number;
  variationRatio: number;
  billAmount: number;
  pvcAmount: number;
}

interface PVCCalculationLog {
  operation: 'CREATE' | 'UPDATE';
  billNumber: string;
  timestamp: string;
  billAmount: number;
  baseDate: string;
  measurementDate: string;
  classifications: {
    name: string;
    components: ComponentCalculation[];
    subtotal: number;
  }[];
  steelComponents: SteelCalculation[];
  dedicatedCement?: DedicatedCalculation;
  dedicatedSteel?: DedicatedCalculation;
  calculation: {
    classificationTotal: number;
    steelComponentTotal: number;
    dedicatedCementTotal: number;
    dedicatedSteelTotal: number;
    totalPVC: number;
  };
}

export class PVCCalculationLogger {
  private static formatNumber(num: number): string {
    return num.toFixed(2);
  }

  private static formatDate(date: Date): string {
    return date.toISOString();
  }

  static logCalculation(log: PVCCalculationLog): void {
    console.log('\n' + '='.repeat(100));
    console.log(`🔍 PVC CALCULATION LOG - ${log.operation}`);
    console.log('='.repeat(100));
    console.log(`📋 Bill Number: ${log.billNumber}`);
    console.log(`⏰ Timestamp: ${log.timestamp}`);
    console.log(`💰 Total Bill Amount: ₹${this.formatNumber(log.billAmount)}`);
    console.log(`📅 Base Date: ${log.baseDate}`);
    console.log(`📅 Measurement Date: ${log.measurementDate}`);
    console.log('');

    // Log Classification Components
    console.log('📊 CLASSIFICATION COMPONENTS:');
    console.log('-'.repeat(100));
    
    let classificationRunningTotal = 0;
    log.classifications.forEach((classification, idx) => {
      console.log(`\n  ${idx + 1}. ${classification.name}`);
      console.log('  ' + '-'.repeat(96));
      
      classification.components.forEach((component) => {
        console.log(`     • ${component.name}:`);
        console.log(`       - Percentage: ${component.percentage}%`);
        console.log(`       - Base Index: ${this.formatNumber(component.baseIndex)}`);
        console.log(`       - Measurement Index: ${this.formatNumber(component.measurementIndex)}`);
        console.log(`       - Variation Ratio: ${this.formatNumber(component.variationRatio)}`);
        console.log(`       - Component Bill Amount: ₹${this.formatNumber(component.billAmount)}`);
        console.log(`       - Component PVC: ₹${this.formatNumber(component.pvcAmount)}`);
        console.log('');
        
        classificationRunningTotal += component.pvcAmount;
      });
      
      console.log(`     ✓ Classification Subtotal: ₹${this.formatNumber(classification.subtotal)}`);
    });
    
    console.log('\n  📌 Total from Classifications: ₹' + this.formatNumber(log.calculation.classificationTotal));

    // Log Steel Components (if any)
    if (log.steelComponents.length > 0) {
      console.log('\n🔩 STEEL COMPONENTS (Classification-based):');
      console.log('-'.repeat(100));
      
      log.steelComponents.forEach((steel, idx) => {
        console.log(`\n  ${idx + 1}. ${steel.type}:`);
        console.log(`     - Percentage: ${steel.percentage}%`);
        console.log(`     - Base Index: ${this.formatNumber(steel.baseIndex)}`);
        console.log(`     - Measurement Index: ${this.formatNumber(steel.measurementIndex)}`);
        console.log(`     - Variation Ratio: ${this.formatNumber(steel.variationRatio)}`);
        console.log(`     - Component Bill Amount: ₹${this.formatNumber(steel.billAmount)}`);
        console.log(`     - Component PVC: ₹${this.formatNumber(steel.pvcAmount)}`);
      });
      
      console.log('\n  📌 Total from Steel Components: ₹' + this.formatNumber(log.calculation.steelComponentTotal));
    }

    // Log Dedicated Cement (if any)
    if (log.dedicatedCement) {
      console.log('\n🏗️ DEDICATED CEMENT (85%):');
      console.log('-'.repeat(100));
      console.log(`     - Base Index: ${this.formatNumber(log.dedicatedCement.baseIndex)}`);
      console.log(`     - Measurement Index: ${this.formatNumber(log.dedicatedCement.measurementIndex)}`);
      console.log(`     - Variation Ratio: ${this.formatNumber(log.dedicatedCement.variationRatio)}`);
      console.log(`     - Component Bill Amount: ₹${this.formatNumber(log.dedicatedCement.billAmount)}`);
      console.log(`     - Component PVC: ₹${this.formatNumber(log.dedicatedCement.pvcAmount)}`);
      console.log('\n  📌 Total from Dedicated Cement: ₹' + this.formatNumber(log.calculation.dedicatedCementTotal));
    }

    // Log Dedicated Steel (if any)
    if (log.dedicatedSteel) {
      console.log('\n🔨 DEDICATED STEEL (85%):');
      console.log('-'.repeat(100));
      console.log(`     - Base Index: ${this.formatNumber(log.dedicatedSteel.baseIndex)}`);
      console.log(`     - Measurement Index: ${this.formatNumber(log.dedicatedSteel.measurementIndex)}`);
      console.log(`     - Variation Ratio: ${this.formatNumber(log.dedicatedSteel.variationRatio)}`);
      console.log(`     - Component Bill Amount: ₹${this.formatNumber(log.dedicatedSteel.billAmount)}`);
      console.log(`     - Component PVC: ₹${this.formatNumber(log.dedicatedSteel.pvcAmount)}`);
      console.log('\n  📌 Total from Dedicated Steel: ₹' + this.formatNumber(log.calculation.dedicatedSteelTotal));
    }

    // Final Calculation Summary
    console.log('\n' + '='.repeat(100));
    console.log('💎 FINAL CALCULATION SUMMARY:');
    console.log('='.repeat(100));
    console.log(`  1. Classification Components Total:  ₹${this.formatNumber(log.calculation.classificationTotal)}`);
    console.log(`  2. Steel Components Total:           ₹${this.formatNumber(log.calculation.steelComponentTotal)}`);
    console.log(`  3. Dedicated Cement Total:           ₹${this.formatNumber(log.calculation.dedicatedCementTotal)}`);
    console.log(`  4. Dedicated Steel Total:            ₹${this.formatNumber(log.calculation.dedicatedSteelTotal)}`);
    console.log('  ' + '-'.repeat(96));
    console.log(`  ✨ TOTAL PVC:                         ₹${this.formatNumber(log.calculation.totalPVC)}`);
    console.log('='.repeat(100));
    console.log('✅ Calculation Complete\n');
  }

  static createLog(
    operation: 'CREATE' | 'UPDATE',
    billNumber: string,
    billAmount: number,
    baseDate: string,
    measurementDate: string
  ): PVCCalculationLog {
    return {
      operation,
      billNumber,
      timestamp: this.formatDate(new Date()),
      billAmount,
      baseDate,
      measurementDate,
      classifications: [],
      steelComponents: [],
      calculation: {
        classificationTotal: 0,
        steelComponentTotal: 0,
        dedicatedCementTotal: 0,
        dedicatedSteelTotal: 0,
        totalPVC: 0,
      },
    };
  }

  static addClassification(
    log: PVCCalculationLog,
    name: string,
    components: ComponentCalculation[],
    subtotal: number
  ): void {
    log.classifications.push({ name, components, subtotal });
  }

  static addSteelComponent(log: PVCCalculationLog, steel: SteelCalculation): void {
    log.steelComponents.push(steel);
  }

  static addDedicatedCement(log: PVCCalculationLog, cement: DedicatedCalculation): void {
    log.dedicatedCement = cement;
  }

  static addDedicatedSteel(log: PVCCalculationLog, steel: DedicatedCalculation): void {
    log.dedicatedSteel = steel;
  }

  static finalize(
    log: PVCCalculationLog,
    classificationTotal: number,
    steelComponentTotal: number,
    dedicatedCementTotal: number,
    dedicatedSteelTotal: number,
    totalPVC: number
  ): void {
    log.calculation = {
      classificationTotal,
      steelComponentTotal,
      dedicatedCementTotal,
      dedicatedSteelTotal,
      totalPVC,
    };
  }
}

export type { PVCCalculationLog, ComponentCalculation, SteelCalculation, DedicatedCalculation };
