import { logger } from './logger';

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
    logger.log('\n' + '='.repeat(100));
    logger.log(`🔍 PVC CALCULATION LOG - ${log.operation}`);
    logger.log('='.repeat(100));
    logger.log(`📋 Bill Number: ${log.billNumber}`);
    logger.log(`⏰ Timestamp: ${log.timestamp}`);
    logger.log(`💰 Total Bill Amount: ₹${this.formatNumber(log.billAmount)}`);
    logger.log(`📅 Base Date: ${log.baseDate}`);
    logger.log(`📅 Measurement Date: ${log.measurementDate}`);
    logger.log('');

    // Log Classification Components
    logger.log('📊 CLASSIFICATION COMPONENTS:');
    logger.log('-'.repeat(100));
    
    let classificationRunningTotal = 0;
    log.classifications.forEach((classification, idx) => {
      logger.log(`\n  ${idx + 1}. ${classification.name}`);
      logger.log('  ' + '-'.repeat(96));
      
      classification.components.forEach((component) => {
        logger.log(`     • ${component.name}:`);
        logger.log(`       - Percentage: ${component.percentage}%`);
        logger.log(`       - Base Index: ${this.formatNumber(component.baseIndex)}`);
        logger.log(`       - Measurement Index: ${this.formatNumber(component.measurementIndex)}`);
        logger.log(`       - Variation Ratio: ${this.formatNumber(component.variationRatio)}`);
        logger.log(`       - Component Bill Amount: ₹${this.formatNumber(component.billAmount)}`);
        logger.log(`       - Component PVC: ₹${this.formatNumber(component.pvcAmount)}`);
        logger.log('');
        
        classificationRunningTotal += component.pvcAmount;
      });
      
      logger.log(`     ✓ Classification Subtotal: ₹${this.formatNumber(classification.subtotal)}`);
    });
    
    logger.log('\n  📌 Total from Classifications: ₹' + this.formatNumber(log.calculation.classificationTotal));

    // Log Steel Components (if any)
    if (log.steelComponents.length > 0) {
      logger.log('\n🔩 STEEL COMPONENTS (Classification-based):');
      logger.log('-'.repeat(100));
      
      log.steelComponents.forEach((steel, idx) => {
        logger.log(`\n  ${idx + 1}. ${steel.type}:`);
        logger.log(`     - Percentage: ${steel.percentage}%`);
        logger.log(`     - Base Index: ${this.formatNumber(steel.baseIndex)}`);
        logger.log(`     - Measurement Index: ${this.formatNumber(steel.measurementIndex)}`);
        logger.log(`     - Variation Ratio: ${this.formatNumber(steel.variationRatio)}`);
        logger.log(`     - Component Bill Amount: ₹${this.formatNumber(steel.billAmount)}`);
        logger.log(`     - Component PVC: ₹${this.formatNumber(steel.pvcAmount)}`);
      });
      
      logger.log('\n  📌 Total from Steel Components: ₹' + this.formatNumber(log.calculation.steelComponentTotal));
    }

    // Log Dedicated Cement (if any)
    if (log.dedicatedCement) {
      logger.log('\n🏗️ DEDICATED CEMENT (85%):');
      logger.log('-'.repeat(100));
      logger.log(`     - Base Index: ${this.formatNumber(log.dedicatedCement.baseIndex)}`);
      logger.log(`     - Measurement Index: ${this.formatNumber(log.dedicatedCement.measurementIndex)}`);
      logger.log(`     - Variation Ratio: ${this.formatNumber(log.dedicatedCement.variationRatio)}`);
      logger.log(`     - Component Bill Amount: ₹${this.formatNumber(log.dedicatedCement.billAmount)}`);
      logger.log(`     - Component PVC: ₹${this.formatNumber(log.dedicatedCement.pvcAmount)}`);
      logger.log('\n  📌 Total from Dedicated Cement: ₹' + this.formatNumber(log.calculation.dedicatedCementTotal));
    }

    // Log Dedicated Steel (if any)
    if (log.dedicatedSteel) {
      logger.log('\n🔨 DEDICATED STEEL (85%):');
      logger.log('-'.repeat(100));
      logger.log(`     - Base Index: ${this.formatNumber(log.dedicatedSteel.baseIndex)}`);
      logger.log(`     - Measurement Index: ${this.formatNumber(log.dedicatedSteel.measurementIndex)}`);
      logger.log(`     - Variation Ratio: ${this.formatNumber(log.dedicatedSteel.variationRatio)}`);
      logger.log(`     - Component Bill Amount: ₹${this.formatNumber(log.dedicatedSteel.billAmount)}`);
      logger.log(`     - Component PVC: ₹${this.formatNumber(log.dedicatedSteel.pvcAmount)}`);
      logger.log('\n  📌 Total from Dedicated Steel: ₹' + this.formatNumber(log.calculation.dedicatedSteelTotal));
    }

    // Final Calculation Summary
    logger.log('\n' + '='.repeat(100));
    logger.log('💎 FINAL CALCULATION SUMMARY:');
    logger.log('='.repeat(100));
    logger.log(`  1. Classification Components Total:  ₹${this.formatNumber(log.calculation.classificationTotal)}`);
    logger.log(`  2. Steel Components Total:           ₹${this.formatNumber(log.calculation.steelComponentTotal)}`);
    logger.log(`  3. Dedicated Cement Total:           ₹${this.formatNumber(log.calculation.dedicatedCementTotal)}`);
    logger.log(`  4. Dedicated Steel Total:            ₹${this.formatNumber(log.calculation.dedicatedSteelTotal)}`);
    logger.log('  ' + '-'.repeat(96));
    logger.log(`  ✨ TOTAL PVC:                         ₹${this.formatNumber(log.calculation.totalPVC)}`);
    logger.log('='.repeat(100));
    logger.log('✅ Calculation Complete\n');
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

