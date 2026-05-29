/**
 * Railway Division Helper
 * 
 * Utilities for parsing and managing railway division information
 * from agreement numbers and routing bills to appropriate officials.
 */

// Railway Zones with their codes and full names
export const RAILWAY_ZONES = {
  'SR': 'Southern Railway',
  'CR': 'Central Railway',
  'WR': 'Western Railway',
  'ER': 'Eastern Railway',
  'NR': 'Northern Railway',
  'NER': 'North Eastern Railway',
  'NFR': 'Northeast Frontier Railway',
  'SCR': 'South Central Railway',
  'SER': 'South Eastern Railway',
  'SECR': 'South East Central Railway',
  'SWR': 'South Western Railway',
  'WCR': 'West Central Railway',
  'ECR': 'East Central Railway',
  'ECoR': 'East Coast Railway',
  'NCR': 'North Central Railway',
  'NWR': 'North Western Railway',
  'KRCL': 'Konkan Railway Corporation Limited',
  'Metro': 'Metro Railway (Kolkata)',
} as const;

// Common divisions for each zone (major divisions only - not exhaustive)
export const ZONE_DIVISIONS: Record<string, Record<string, string>> = {
  'SR': {
    'MAS': 'Chennai',
    'TPJ': 'Tiruchirapalli',
    'SA': 'Salem',
    'MDU': 'Madurai',
    'PGT': 'Palakkad',
    'TVC': 'Thiruvananthapuram',
  },
  'CR': {
    'CSTM': 'Mumbai CSTM',
    'BB': 'Mumbai Central',
    'BRC': 'Vadodara',
    'BH': 'Bhusawal',
    'NGP': 'Nagpur',
    'PUNE': 'Pune',
    'SUR': 'Solapur',
  },
  'WR': {
    'BCT': 'Mumbai Central (WR)',
    'RTM': 'Ratlam',
    'ADI': 'Ahmedabad',
    'RJT': 'Rajkot',
    'BH': 'Bhavnagar',
  },
  'NR': {
    'DLI': 'Delhi',
    'LKO': 'Lucknow',
    'FBD': 'Firozpur',
    'MB': 'Moradabad',
    'NDLS': 'New Delhi',
    'AGC': 'Agra Cantonment',
    'AMB': 'Ambala',
  },
  // Add more as needed
};

/**
 * Agreement Number Pattern:
 * Format: ZONE/DIVISION/DEPARTMENT/YEAR/NUMBER
 * Example: SR/TPJ/Civil/2024/0120
 * 
 * Components:
 * - ZONE: Railway zone code (SR, CR, WR, etc.)
 * - DIVISION: Division code (TPJ, MAS, etc.)
 * - DEPARTMENT: Department (Civil, Electrical, Mechanical, S&T, etc.)
 * - YEAR: Contract year
 * - NUMBER: Sequential contract number
 */
export interface AgreementNumberParts {
  zone: string;
  zoneName: string;
  division: string;
  divisionName: string;
  department: string;
  year: string;
  number: string;
  fullAgreementNo: string;
}

/**
 * Parse agreement number to extract zone and division information
 */
export function parseAgreementNumber(agreementNo: string): AgreementNumberParts | null {
  if (!agreementNo) return null;

  // Try standard pattern: ZONE/DIVISION/DEPT/YEAR/NUMBER
  const parts = agreementNo.split('/');
  
  if (parts.length < 3) {
    // Invalid format
    return null;
  }

  const zone = parts[0]?.trim().toUpperCase();
  const division = parts[1]?.trim().toUpperCase();
  const department = parts[2]?.trim();
  const year = parts[3]?.trim() || '';
  const number = parts[4]?.trim() || '';

  // Get zone name
  const zoneName = RAILWAY_ZONES[zone as keyof typeof RAILWAY_ZONES] || zone;

  // Get division name
  const divisionName = ZONE_DIVISIONS[zone]?.[division] || division;

  return {
    zone,
    zoneName,
    division,
    divisionName,
    department,
    year,
    number,
    fullAgreementNo: agreementNo,
  };
}

/**
 * Check if a railway official's division matches the contract division
 */
export function isOfficialInContractDivision(
  officialDivision: string | null,
  officialZone: string | null,
  contractAgreementNo: string
): boolean {
  if (!officialDivision || !officialZone) return false;

  const parsed = parseAgreementNumber(contractAgreementNo);
  if (!parsed) return false;

  // Match both zone and division
  return (
    parsed.zone.toUpperCase() === officialZone.toUpperCase() &&
    parsed.division.toUpperCase() === officialDivision.toUpperCase()
  );
}

/**
 * Get list of railway officials for a specific division
 * (to be used in approval routing)
 */
export async function getOfficialsByDivision(
  zone: string,
  division: string,
  prisma: any // PrismaClient
) {
  return await prisma.user.findMany({
    where: {
      role: 'railway_official',
      railwayZone: zone,
      division: division,
      isCurrentPosting: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      designation: true,
      department: true,
      division: true,
      divisionName: true,
      railwayZone: true,
      railwayZoneName: true,
      officeLocation: true,
    },
    orderBy: {
      designation: 'asc', // Can be customized based on hierarchy
    },
  });
}

/**
 * Get the appropriate railway official for bill approval
 * based on contract division and bill amount
 */
export async function getApprovalOfficialForBill(
  contractAgreementNo: string,
  billAmount: number,
  department: string,
  prisma: any
): Promise<any | null> {
  const parsed = parseAgreementNumber(contractAgreementNo);
  if (!parsed) return null;

  // Get officials from the same division and department
  const officials = await prisma.user.findMany({
    where: {
      role: 'railway_official',
      railwayZone: parsed.zone,
      division: parsed.division,
      department: department || parsed.department,
      isCurrentPosting: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      designation: true,
      department: true,
    },
  });

  // Hierarchy for approval based on bill amount (can be customized)
  // Higher amounts require higher authority
  const designationHierarchy = ['JE', 'AE', 'DE', 'SSE', 'DEN', 'DRM', 'GM'];
  
  // Simple logic: for now, return the first available official
  // In production, implement proper hierarchy based on bill amount
  if (officials.length > 0) {
    // Sort by designation hierarchy
    officials.sort((a: any, b: any) => {
      const aIndex = designationHierarchy.indexOf(a.designation || '');
      const bIndex = designationHierarchy.indexOf(b.designation || '');
      return aIndex - bIndex;
    });
    return officials[0];
  }

  return null;
}

/**
 * Format division display name
 */
export function formatDivisionDisplay(
  division: string | null,
  divisionName: string | null,
  zone: string | null,
  zoneName: string | null
): string {
  if (!division && !zone) return 'N/A';
  
  const parts: string[] = [];
  
  if (divisionName) {
    parts.push(divisionName);
  } else if (division) {
    parts.push(division);
  }
  
  if (zoneName) {
    parts.push(zoneName);
  } else if (zone) {
    parts.push(zone);
  }
  
  return parts.join(' - ');
}

export default {
  RAILWAY_ZONES,
  ZONE_DIVISIONS,
  parseAgreementNumber,
  isOfficialInContractDivision,
  getOfficialsByDivision,
  getApprovalOfficialForBill,
  formatDivisionDisplay,
};
