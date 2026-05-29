/**
 * Classification Helper - Updated to use new hierarchical structure
 * Uses SubClassification and ClassificationGroup models
 * 
 * DEPRECATED: Old Classification model is kept for backward compatibility only
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ClassificationWithComponents {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  fixed: number;
  labour: number;
  steel: number;
  cement: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  explosives: number;
  isActive: boolean;
  isDefault: boolean;
  subClassifications?: any;
  groupId?: string;
  group?: any;
}

/**
 * Fetch a sub-classification by code (NEW HIERARCHICAL STRUCTURE)
 */
export async function getSubClassificationByCode(code: string): Promise<ClassificationWithComponents | null> {
  try {
    const subClassification = await prisma.subClassification.findFirst({
      where: { 
        code,
        isActive: true 
      },
      include: {
        group: true
      }
    });
    
    if (!subClassification) {
      // Fallback to legacy classification for backward compatibility
      return await getClassificationByCode(code);
    }
    
    return subClassification;
  } catch (error) {
    console.error(`Error fetching sub-classification ${code}:`, error);
    // Fallback to legacy classification
    return await getClassificationByCode(code);
  }
}

/**
 * Fetch all active sub-classifications (NEW HIERARCHICAL STRUCTURE)
 */
export async function getAllActiveSubClassifications(): Promise<ClassificationWithComponents[]> {
  try {
    const subClassifications = await prisma.subClassification.findMany({
      where: { isActive: true },
      include: {
        group: true
      },
      orderBy: [
        { isDefault: 'desc' },
        { code: 'asc' }
      ]
    });
    
    if (subClassifications.length === 0) {
      // Fallback to legacy classifications for backward compatibility
      return await getAllActiveClassifications();
    }
    
    return subClassifications;
  } catch (error) {
    console.error('Error fetching sub-classifications:', error);
    // Fallback to legacy classifications
    return await getAllActiveClassifications();
  }
}

/**
 * Fetch the default sub-classification (NEW HIERARCHICAL STRUCTURE)
 */
export async function getDefaultSubClassification(): Promise<ClassificationWithComponents | null> {
  try {
    const subClassification = await prisma.subClassification.findFirst({
      where: { 
        isDefault: true,
        isActive: true 
      },
      include: {
        group: true
      }
    });
    
    if (!subClassification) {
      // Try to get the first active sub-classification
      const firstSub = await prisma.subClassification.findFirst({
        where: { isActive: true },
        include: {
          group: true
        },
        orderBy: { code: 'asc' }
      });
      
      if (firstSub) return firstSub;
      
      // Last resort: fallback to legacy classification
      return await getDefaultClassification();
    }
    
    return subClassification;
  } catch (error) {
    console.error('Error fetching default sub-classification:', error);
    // Fallback to legacy classification
    return await getDefaultClassification();
  }
}

/**
 * Get sub-classification or default fallback (NEW HIERARCHICAL STRUCTURE)
 */
export async function getClassificationOrDefault(code?: string | null): Promise<ClassificationWithComponents | null> {
  if (code) {
    const classification = await getSubClassificationByCode(code);
    if (classification) return classification;
  }
  
  // Fallback to default sub-classification
  const defaultSub = await getDefaultSubClassification();
  if (defaultSub) return defaultSub;
  
  // Last resort: fallback to legacy default classification
  return await getDefaultClassification();
}

/**
 * Fetch all classification groups with their sub-classifications (NEW HIERARCHICAL STRUCTURE)
 */
export async function getAllClassificationGroups() {
  try {
    const groups = await prisma.classificationGroup.findMany({
      where: { isActive: true },
      include: {
        subClassifications: {
          where: { isActive: true },
          orderBy: { code: 'asc' }
        }
      },
      orderBy: { code: 'asc' }
    });
    
    return groups;
  } catch (error) {
    console.error('Error fetching classification groups:', error);
    return [];
  }
}

// ==================== DEPRECATED LEGACY FUNCTIONS ====================
// These functions are kept for backward compatibility only
// They use the old Classification model which is deprecated

/**
 * @deprecated Use getSubClassificationByCode instead
 * Fetch a single classification by code (LEGACY)
 */
export async function getClassificationByCode(code: string): Promise<ClassificationWithComponents | null> {
  try {
    const classification = await prisma.classification.findFirst({
      where: { 
        code,
        isActive: true 
      }
    });
    return classification;
  } catch (error) {
    console.error(`Error fetching legacy classification ${code}:`, error);
    return null;
  }
}

/**
 * @deprecated Use getAllActiveSubClassifications instead
 * Fetch all active classifications (LEGACY)
 */
export async function getAllActiveClassifications(): Promise<ClassificationWithComponents[]> {
  try {
    const classifications = await prisma.classification.findMany({
      where: { isActive: true },
      orderBy: [
        { isDefault: 'desc' },
        { code: 'asc' }
      ]
    });
    return classifications;
  } catch (error) {
    console.error('Error fetching legacy classifications:', error);
    return [];
  }
}

/**
 * @deprecated Use getDefaultSubClassification instead
 * Fetch the default classification (LEGACY)
 */
export async function getDefaultClassification(): Promise<ClassificationWithComponents | null> {
  try {
    const classification = await prisma.classification.findFirst({
      where: { 
        isDefault: true,
        isActive: true 
      }
    });
    
    return classification;
  } catch (error) {
    console.error('Error fetching legacy default classification:', error);
    return null;
  }
}
