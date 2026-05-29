// Complete GCC 46A Classification Structure with Component Percentages (Custom Statutory Values)

export interface GCCClassification {
  code: string;
  mainClassification: string;
  subClassification: string;
  description: string;
  components: {
    fixed: number;
    labour: number;
    steel: number;
    cement: number;
    plantMachinery: number;
    fuel: number;
    otherMaterials: number;
    explosives: number;
  };
  keywords: string[];
  examples: string[];
  whenToUse: string;
  whenNotToUse: string;
}

export const GCC_CLASSIFICATIONS: GCCClassification[] = [
  // Classification 1: Earthwork in Formation
  {
    code: '1A',
    mainClassification: 'Earthwork in Formation',
    subClassification: 'All Items (excluding 1B or/and 1C)',
    description: 'General earthwork activities including excavation, filling, and compaction',
    components: {
      fixed: 15,
      labour: 20,
      steel: 0,
      cement: 0,
      plantMachinery: 30,
      fuel: 25,
      otherMaterials: 10,
      explosives: 0
    },
    keywords: ['earthwork', 'excavation', 'filling', 'compaction', 'cutting', 'formation', 'embankment'],
    examples: [
      'Excavation in ordinary soil',
      'Filling with approved material',
      'Compaction of earthwork',
      'Formation of embankment'
    ],
    whenToUse: 'Use for general earthwork activities where steel and cement are not the primary deliverables',
    whenNotToUse: 'Do not use if work primarily involves steel or cement supply'
  },
  {
    code: '1B',
    mainClassification: 'Earthwork in Formation',
    subClassification: 'Items for supply of Steel',
    description: 'Earthwork items where steel supply is the primary component',
    components: {
      fixed: 15,
      labour: 0,
      steel: 85,
      cement: 0,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['steel supply', 'steel bars', 'reinforcement', 'TMT', 'steel material'],
    examples: [
      'Supply of steel bars for soil nailing',
      'Supply of reinforcement for retaining structures',
      'Supply of TMT bars for earthwork support'
    ],
    whenToUse: 'Use when the work item is primarily for supplying steel materials in earthwork',
    whenNotToUse: 'Do not use for general earthwork or when steel is incidental'
  },
  {
    code: '1C',
    mainClassification: 'Earthwork in Formation',
    subClassification: 'Items for supply of Cement',
    description: 'Earthwork items where cement supply is the primary component',
    components: {
      fixed: 15,
      labour: 0,
      steel: 0,
      cement: 85,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['cement supply', 'cement stabilization', 'grouting', 'cement bags'],
    examples: [
      'Supply of cement for soil stabilization',
      'Supply of cement for grouting in earthwork'
    ],
    whenToUse: 'Use when cement is the primary material being supplied for earthwork',
    whenNotToUse: 'Do not use for general earthwork or concrete work'
  },

  // Classification 2: Ballast Supply Works
  {
    code: '2',
    mainClassification: 'Ballast Supply Works',
    subClassification: 'Single classification',
    description: 'Supply of ballast material for railway track',
    components: {
      fixed: 15,
      labour: 20,
      steel: 0,
      cement: 0,
      plantMachinery: 30,
      fuel: 25,
      otherMaterials: 10,
      explosives: 0
    },
    keywords: ['ballast', 'track ballast', 'stone chips', 'crushed stone', 'railway ballast'],
    examples: [
      'Supply of track ballast',
      'Supply of crushed stone ballast',
      'Ballast screening and supply'
    ],
    whenToUse: 'Use for all ballast supply work for railway tracks',
    whenNotToUse: 'Do not use for other types of stone or aggregate supply'
  },

  // Classification 3: Tunnelling Works (Without Explosives)
  {
    code: '3A',
    mainClassification: 'Tunnelling Works (Without Explosives)',
    subClassification: 'All Items (excluding 3B/3C/3D/3E)',
    description: 'General tunneling work without use of explosives',
    components: {
      fixed: 15,
      labour: 20,
      steel: 0,
      cement: 0,
      plantMachinery: 30,
      fuel: 25,
      otherMaterials: 10,
      explosives: 0
    },
    keywords: ['tunneling', 'tunnel boring', 'TBM', 'underground', 'excavation'],
    examples: [
      'TBM tunneling work',
      'Tunnel excavation without blasting',
      'Support installation in tunnel'
    ],
    whenToUse: 'Use for general tunneling work where explosives are not used',
    whenNotToUse: 'Do not use if explosives are involved or if primarily steel/cement supply'
  },
  {
    code: '3B',
    mainClassification: 'Tunnelling Works (Without Explosives)',
    subClassification: 'Items for supply of Steel',
    description: 'Steel supply for tunneling work',
    components: {
      fixed: 15,
      labour: 0,
      steel: 85,
      cement: 0,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['steel supply', 'steel support', 'steel ribs', 'steel lattice'],
    examples: [
      'Supply of steel ribs for tunnel support',
      'Supply of steel lattice girders'
    ],
    whenToUse: 'Use when supplying steel materials for tunneling work',
    whenNotToUse: 'Do not use for fabrication work or general tunneling'
  },
  {
    code: '3C',
    mainClassification: 'Tunnelling Works (Without Explosives)',
    subClassification: 'Items for supply of Cement or/and Grout',
    description: 'Cement/grout supply for tunneling',
    components: {
      fixed: 15,
      labour: 0,
      steel: 0,
      cement: 85,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['cement', 'grouting', 'shotcrete', 'concrete lining'],
    examples: [
      'Supply of cement for tunnel lining',
      'Supply of grouting material'
    ],
    whenToUse: 'Use for cement or grout supply in tunneling',
    whenNotToUse: 'Do not use for general concrete work'
  },
  {
    code: '3D',
    mainClassification: 'Tunnelling Works (Without Explosives)',
    subClassification: 'Fabrication & Erection including Steel Supply',
    description: 'Fabrication and erection work with steel supply',
    components: {
      fixed: 15,
      labour: 10,
      steel: 50,
      cement: 0,
      plantMachinery: 10,
      fuel: 10,
      otherMaterials: 5,
      explosives: 0
    },
    keywords: ['fabrication', 'erection', 'steel structure', 'assembly'],
    examples: [
      'Fabricate and erect steel support with material',
      'Assembly of steel structure including supply'
    ],
    whenToUse: 'Use when contractor supplies steel AND fabricates/erects',
    whenNotToUse: 'Do not use if steel is supplied separately'
  },
  {
    code: '3E',
    mainClassification: 'Tunnelling Works (Without Explosives)',
    subClassification: 'Fabrication & Erection excluding Steel Supply',
    description: 'Fabrication and erection without steel supply',
    components: {
      fixed: 15,
      labour: 25,
      steel: 0,
      cement: 0,
      plantMachinery: 30,
      fuel: 20,
      otherMaterials: 10,
      explosives: 0
    },
    keywords: ['fabrication', 'erection', 'labour only', 'installation'],
    examples: [
      'Erect steel support (steel supplied by Railway)',
      'Installation of structures (material supplied separately)'
    ],
    whenToUse: 'Use when contractor only fabricates/erects (steel supplied by Railway)',
    whenNotToUse: 'Do not use if contractor supplies steel'
  },

  // Classification 4: Tunnelling Works (With Explosives)
  {
    code: '4A',
    mainClassification: 'Tunnelling Works (With Explosives)',
    subClassification: 'All Items (excluding 4B/4C/4D/4E)',
    description: 'General tunneling work using explosives',
    components: {
      fixed: 15,
      labour: 25,
      steel: 0,
      cement: 0,
      plantMachinery: 15,
      fuel: 15,
      otherMaterials: 15,
      explosives: 15
    },
    keywords: ['blasting', 'explosives', 'drill and blast', 'rock excavation'],
    examples: [
      'Tunnel excavation by blasting',
      'Drill and blast method for tunneling'
    ],
    whenToUse: 'Use for tunneling work involving explosives',
    whenNotToUse: 'Do not use if no explosives are used'
  },
  {
    code: '4B',
    mainClassification: 'Tunnelling Works (With Explosives)',
    subClassification: 'Items for supply of Steel',
    description: 'Steel supply for explosive-based tunneling',
    components: {
      fixed: 15,
      labour: 0,
      steel: 85,
      cement: 0,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['steel supply', 'steel support', 'reinforcement'],
    examples: [
      'Supply of steel for tunnel support (blast method)'
    ],
    whenToUse: 'Use for steel supply in tunneling with explosives',
    whenNotToUse: 'Do not use for fabrication or general work'
  },
  {
    code: '4C',
    mainClassification: 'Tunnelling Works (With Explosives)',
    subClassification: 'Items for supply of Cement or/and Grout',
    description: 'Cement/grout supply for explosive-based tunneling',
    components: {
      fixed: 15,
      labour: 0,
      steel: 0,
      cement: 85,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['cement', 'grouting', 'shotcrete'],
    examples: [
      'Supply of cement for tunnel lining (blast method)'
    ],
    whenToUse: 'Use for cement supply in tunneling with explosives',
    whenNotToUse: 'Do not use for general concrete work'
  },
  {
    code: '4D',
    mainClassification: 'Tunnelling Works (With Explosives)',
    subClassification: 'Fabrication & Erection including Steel Supply',
    description: 'Fabrication and erection with steel supply in blasting tunnels',
    components: {
      fixed: 15,
      labour: 10,
      steel: 50,
      cement: 0,
      plantMachinery: 10,
      fuel: 10,
      otherMaterials: 5,
      explosives: 0
    },
    keywords: ['fabrication', 'erection', 'steel structure'],
    examples: [
      'Fabricate and erect support structure with steel'
    ],
    whenToUse: 'Use when contractor supplies steel AND fabricates in blast tunneling',
    whenNotToUse: 'Do not use if steel supplied separately'
  },
  {
    code: '4E',
    mainClassification: 'Tunnelling Works (With Explosives)',
    subClassification: 'Fabrication & Erection excluding Steel Supply',
    description: 'Fabrication and erection without steel supply in blasting tunnels',
    components: {
      fixed: 15,
      labour: 25,
      steel: 0,
      cement: 0,
      plantMachinery: 30,
      fuel: 20,
      otherMaterials: 10,
      explosives: 0
    },
    keywords: ['fabrication', 'erection', 'labour only'],
    examples: [
      'Erect support (steel supplied by Railway, blast method)'
    ],
    whenToUse: 'Use when only fabricating/erecting in blast tunneling (steel supplied by Railway)',
    whenNotToUse: 'Do not use if contractor supplies steel'
  },

  // Classification 5: Building Works
  {
    code: '5A',
    mainClassification: 'Building Works',
    subClassification: 'All Items (excluding 5B/5C/5D/5E)',
    description: 'General building construction work',
    components: {
      fixed: 15,
      labour: 30,
      steel: 0,
      cement: 15,
      plantMachinery: 5,
      fuel: 5,
      otherMaterials: 30,
      explosives: 0
    },
    keywords: ['building', 'construction', 'masonry', 'plastering', 'finishing'],
    examples: [
      'Construction of station building',
      'RCC work for building',
      'Masonry and plastering work'
    ],
    whenToUse: 'Use for general building construction activities',
    whenNotToUse: 'Do not use for pure steel/cement supply or fabrication'
  },
  {
    code: '5B',
    mainClassification: 'Building Works',
    subClassification: 'Items for supply of Steel',
    description: 'Steel supply for building construction',
    components: {
      fixed: 15,
      labour: 0,
      steel: 85,
      cement: 0,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['steel supply', 'TMT bars', 'reinforcement', 'structural steel'],
    examples: [
      'Supply of TMT bars for building',
      'Supply of structural steel sections'
    ],
    whenToUse: 'Use for steel supply in building work',
    whenNotToUse: 'Do not use for general construction'
  },
  {
    code: '5C',
    mainClassification: 'Building Works',
    subClassification: 'Items for supply of Cement',
    description: 'Cement supply for building construction',
    components: {
      fixed: 15,
      labour: 0,
      steel: 0,
      cement: 85,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['cement supply', 'cement bags', 'concrete mix'],
    examples: [
      'Supply of cement for building work',
      'Supply of ready-mix concrete'
    ],
    whenToUse: 'Use for cement supply in building work',
    whenNotToUse: 'Do not use for general construction'
  },
  {
    code: '5D',
    mainClassification: 'Building Works',
    subClassification: 'Fabrication & Erection including Steel Supply',
    description: 'Steel structure fabrication with supply for buildings',
    components: {
      fixed: 15,
      labour: 10,
      steel: 50,
      cement: 0,
      plantMachinery: 10,
      fuel: 10,
      otherMaterials: 5,
      explosives: 0
    },
    keywords: ['fabrication', 'steel structure', 'erection', 'assembly'],
    examples: [
      'Fabricate and erect steel roof structure with material',
      'Assembly of steel framework including supply'
    ],
    whenToUse: 'Use when contractor supplies steel AND fabricates for building',
    whenNotToUse: 'Do not use if steel supplied separately'
  },
  {
    code: '5E',
    mainClassification: 'Building Works',
    subClassification: 'Fabrication & Erection excluding Steel Supply',
    description: 'Steel structure fabrication without supply for buildings',
    components: {
      fixed: 15,
      labour: 25,
      steel: 0,
      cement: 0,
      plantMachinery: 30,
      fuel: 20,
      otherMaterials: 10,
      explosives: 0
    },
    keywords: ['fabrication', 'erection', 'labour only', 'installation'],
    examples: [
      'Erect steel structure (steel supplied by Railway)',
      'Installation of prefab structure'
    ],
    whenToUse: 'Use when only fabricating/erecting (steel supplied by Railway)',
    whenNotToUse: 'Do not use if contractor supplies steel'
  },

  // Classification 6: Bridges & Protection Work
  {
    code: '6A',
    mainClassification: 'Bridges & Protection Work',
    subClassification: 'All Items (excluding 6B/6C/6D/6E)',
    description: 'General bridge and protection work',
    components: {
      fixed: 15,
      labour: 20,
      steel: 0,
      cement: 0,
      plantMachinery: 20,
      fuel: 15,
      otherMaterials: 30,
      explosives: 0
    },
    keywords: ['bridge', 'culvert', 'protection work', 'ROB', 'RUB'],
    examples: [
      'Construction of railway bridge',
      'Construction of culvert',
      'Protection wall construction'
    ],
    whenToUse: 'Use for general bridge and protection work',
    whenNotToUse: 'Do not use for girder fabrication or pure supply work'
  },
  {
    code: '6B',
    mainClassification: 'Bridges & Protection Work',
    subClassification: 'Items for supply of Steel',
    description: 'Steel supply for bridge work',
    components: {
      fixed: 15,
      labour: 0,
      steel: 85,
      cement: 0,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['steel supply', 'girders', 'structural steel', 'reinforcement'],
    examples: [
      'Supply of steel for bridge construction',
      'Supply of steel girders'
    ],
    whenToUse: 'Use for steel supply in bridge work',
    whenNotToUse: 'Do not use for fabrication or general construction'
  },
  {
    code: '6C',
    mainClassification: 'Bridges & Protection Work',
    subClassification: 'Items for supply of Cement',
    description: 'Cement supply for bridge work',
    components: {
      fixed: 15,
      labour: 0,
      steel: 0,
      cement: 85,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['cement supply', 'concrete', 'cement bags'],
    examples: [
      'Supply of cement for bridge work',
      'Supply of concrete for bridge deck'
    ],
    whenToUse: 'Use for cement supply in bridge work',
    whenNotToUse: 'Do not use for general construction'
  },
  {
    code: '6D',
    mainClassification: 'Bridges & Protection Work',
    subClassification: 'Fabrication, Assembly, Erection & Launching including Steel',
    description: 'Complete girder work with steel supply',
    components: {
      fixed: 15,
      labour: 10,
      steel: 50,
      cement: 0,
      plantMachinery: 10,
      fuel: 10,
      otherMaterials: 5,
      explosives: 0
    },
    keywords: ['girder fabrication', 'launching', 'erection', 'steel supply'],
    examples: [
      'Fabricate, assemble, erect and launch girders with steel',
      'Complete bridge girder work including material'
    ],
    whenToUse: 'Use when contractor supplies steel AND does all fabrication/launching',
    whenNotToUse: 'Do not use if steel supplied separately'
  },
  {
    code: '6E',
    mainClassification: 'Bridges & Protection Work',
    subClassification: 'Fabrication, Assembly, Erection & Launching excluding Steel',
    description: 'Complete girder work without steel supply',
    components: {
      fixed: 15,
      labour: 25,
      steel: 0,
      cement: 0,
      plantMachinery: 30,
      fuel: 20,
      otherMaterials: 10,
      explosives: 0
    },
    keywords: ['girder erection', 'launching', 'labour only'],
    examples: [
      'Erect and launch girders (steel supplied by Railway)',
      'Assembly of prefabricated girders'
    ],
    whenToUse: 'Use when only doing fabrication/launching (steel supplied by Railway)',
    whenNotToUse: 'Do not use if contractor supplies steel'
  },

  // Classification 7: Permanent Way Linking
  {
    code: '7',
    mainClassification: 'Permanent Way Linking',
    subClassification: 'Single classification',
    description: 'Track laying and linking work',
    components: {
      fixed: 15,
      labour: 50,
      steel: 0,
      cement: 0,
      plantMachinery: 15,
      fuel: 15,
      otherMaterials: 5,
      explosives: 0
    },
    keywords: ['track laying', 'permanent way', 'linking', 'railway track', 'sleepers'],
    examples: [
      'Laying of railway track',
      'Track linking work',
      'Installation of sleepers and rails'
    ],
    whenToUse: 'Use for all track laying and permanent way work',
    whenNotToUse: 'Do not use for ballast supply (use Classification 2)'
  },

  // Classification 8: Platform, Passenger Amenities
  {
    code: '8A',
    mainClassification: 'Platform, Passenger Amenities',
    subClassification: 'All Items (excluding 8B/8C/8D/8E)',
    description: 'General platform and passenger amenity work',
    components: {
      fixed: 15,
      labour: 20,
      steel: 0,
      cement: 0,
      plantMachinery: 20,
      fuel: 20,
      otherMaterials: 25,
      explosives: 0
    },
    keywords: ['platform', 'passenger amenities', 'shelter', 'waiting room', 'facilities'],
    examples: [
      'Construction of platform',
      'Passenger shelter construction',
      'Waiting room facilities'
    ],
    whenToUse: 'Use for general platform and amenity construction',
    whenNotToUse: 'Do not use for pure supply or fabrication work'
  },
  {
    code: '8B',
    mainClassification: 'Platform, Passenger Amenities',
    subClassification: 'Items for supply of Steel item/fittings',
    description: 'Steel items and fittings supply for platforms',
    components: {
      fixed: 15,
      labour: 0,
      steel: 85,
      cement: 0,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['steel fittings', 'railings', 'benches', 'steel items'],
    examples: [
      'Supply of platform railings',
      'Supply of steel benches and fittings'
    ],
    whenToUse: 'Use for steel items/fittings supply for platforms',
    whenNotToUse: 'Do not use for general construction'
  },
  {
    code: '8C',
    mainClassification: 'Platform, Passenger Amenities',
    subClassification: 'Items for supply of Cement Item',
    description: 'Cement supply for platform work',
    components: {
      fixed: 15,
      labour: 0,
      steel: 0,
      cement: 85,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['cement supply', 'concrete', 'paving'],
    examples: [
      'Supply of cement for platform paving',
      'Supply of concrete for platform work'
    ],
    whenToUse: 'Use for cement supply in platform work',
    whenNotToUse: 'Do not use for general construction'
  },
  {
    code: '8D',
    mainClassification: 'Platform, Passenger Amenities',
    subClassification: 'Fabrication & Erection including Steel Supply',
    description: 'Fabrication and erection with steel supply for platforms',
    components: {
      fixed: 15,
      labour: 10,
      steel: 50,
      cement: 0,
      plantMachinery: 10,
      fuel: 10,
      otherMaterials: 5,
      explosives: 0
    },
    keywords: ['fabrication', 'steel structure', 'shelter', 'canopy'],
    examples: [
      'Fabricate and erect platform shelter with steel',
      'Assembly of platform canopy including material'
    ],
    whenToUse: 'Use when contractor supplies steel AND fabricates for platform',
    whenNotToUse: 'Do not use if steel supplied separately'
  },
  {
    code: '8E',
    mainClassification: 'Platform, Passenger Amenities',
    subClassification: 'Fabrication & Erection excluding Steel Supply',
    description: 'Fabrication and erection without steel supply for platforms',
    components: {
      fixed: 15,
      labour: 25,
      steel: 0,
      cement: 0,
      plantMachinery: 30,
      fuel: 20,
      otherMaterials: 10,
      explosives: 0
    },
    keywords: ['fabrication', 'erection', 'labour only', 'installation'],
    examples: [
      'Erect platform shelter (steel supplied by Railway)',
      'Installation of prefab amenities'
    ],
    whenToUse: 'Use when only fabricating/erecting (steel supplied by Railway)',
    whenNotToUse: 'Do not use if contractor supplies steel'
  },

  // Classification 9: Any Other Works
  {
    code: '9A',
    mainClassification: 'Any Other Works',
    subClassification: 'All Items (excluding 9B/9C/9D/9E)',
    description: 'Other civil engineering works not covered in Classifications 1-8',
    components: {
      fixed: 15,
      labour: 20,
      steel: 0,
      cement: 0,
      plantMachinery: 30,
      fuel: 15,
      otherMaterials: 20,
      explosives: 0
    },
    keywords: ['other works', 'miscellaneous', 'general civil work'],
    examples: [
      'Miscellaneous civil work',
      'Special structures not covered above'
    ],
    whenToUse: 'Use only when work does not fit in Classifications 1-8',
    whenNotToUse: 'Always check Classifications 1-8 first'
  },
  {
    code: '9B',
    mainClassification: 'Any Other Works',
    subClassification: 'Items for supply of Steel',
    description: 'Steel supply for other works',
    components: {
      fixed: 15,
      labour: 0,
      steel: 85,
      cement: 0,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['steel supply', 'miscellaneous steel'],
    examples: [
      'Supply of steel for special structures'
    ],
    whenToUse: 'Use for steel supply in other works',
    whenNotToUse: 'Check if work fits in Classifications 1-8 first'
  },
  {
    code: '9C',
    mainClassification: 'Any Other Works',
    subClassification: 'Items for supply of Cement or/and Grout',
    description: 'Cement/grout supply for other works',
    components: {
      fixed: 15,
      labour: 0,
      steel: 0,
      cement: 85,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0
    },
    keywords: ['cement supply', 'grouting', 'miscellaneous concrete'],
    examples: [
      'Supply of cement/grout for special structures'
    ],
    whenToUse: 'Use for cement supply in other works',
    whenNotToUse: 'Check if work fits in Classifications 1-8 first'
  },
  {
    code: '9D',
    mainClassification: 'Any Other Works',
    subClassification: 'Fabrication & Erection including Steel Supply',
    description: 'Fabrication with steel supply for other works',
    components: {
      fixed: 15,
      labour: 10,
      steel: 50,
      cement: 0,
      plantMachinery: 10,
      fuel: 10,
      otherMaterials: 5,
      explosives: 0
    },
    keywords: ['fabrication', 'steel structure', 'miscellaneous'],
    examples: [
      'Fabricate and erect special structure with steel'
    ],
    whenToUse: 'Use when contractor supplies steel AND fabricates for other works',
    whenNotToUse: 'Check if work fits in Classifications 1-8 first'
  },
  {
    code: '9E',
    mainClassification: 'Any Other Works',
    subClassification: 'Fabrication & Erection excluding Steel Supply',
    description: 'Fabrication without steel supply for other works',
    components: {
      fixed: 15,
      labour: 25,
      steel: 0,
      cement: 0,
      plantMachinery: 30,
      fuel: 20,
      otherMaterials: 10,
      explosives: 0
    },
    keywords: ['fabrication', 'erection', 'labour only'],
    examples: [
      'Erect special structure (steel supplied by Railway)'
    ],
    whenToUse: 'Use when only fabricating/erecting for other works (steel supplied by Railway)',
    whenNotToUse: 'Check if work fits in Classifications 1-8 first'
  }
];

// Helper function to search classifications
export function searchClassifications(query: string): GCCClassification[] {
  const lowerQuery = query.toLowerCase();
  return GCC_CLASSIFICATIONS.filter(c => 
    c.code.toLowerCase().includes(lowerQuery) ||
    c.mainClassification.toLowerCase().includes(lowerQuery) ||
    c.subClassification.toLowerCase().includes(lowerQuery) ||
    c.description.toLowerCase().includes(lowerQuery) ||
    c.keywords.some(k => k.toLowerCase().includes(lowerQuery)) ||
    c.examples.some(e => e.toLowerCase().includes(lowerQuery))
  );
}

// Helper function to get classification by code
export function getClassificationByCode(code: string): GCCClassification | undefined {
  return GCC_CLASSIFICATIONS.find(c => c.code === code);
}

// Helper function to get all main classifications
export function getMainClassifications(): string[] {
  return Array.from(new Set(GCC_CLASSIFICATIONS.map(c => c.mainClassification)));
}

// Helper function to get sub-classifications for a main classification
export function getSubClassifications(mainClassification: string): GCCClassification[] {
  return GCC_CLASSIFICATIONS.filter(c => c.mainClassification === mainClassification);
}
