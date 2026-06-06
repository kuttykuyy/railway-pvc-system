export const OFFICIAL_RAILWAY_EMAIL_DOMAINS = [
  'railnet.gov.in',
  'indianrailways.gov.in',
];

export function isOfficialRailwayEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  return OFFICIAL_RAILWAY_EMAIL_DOMAINS.some((domain) =>
    normalized.endsWith(`@${domain}`) || normalized.endsWith(`.${domain}`)
  );
}

export function getOfficialRailwayEmailDomainHelp() {
  return OFFICIAL_RAILWAY_EMAIL_DOMAINS.join(', ');
}
