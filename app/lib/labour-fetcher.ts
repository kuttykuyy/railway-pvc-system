/**
 * Labour Index Fetcher - Fetches CPI-IW (All India) data from Labour Bureau
 * Source: https://labourbureau.gov.in/all-india-index
 * Base Year: 2016 = 100
 */

import { prisma } from './db';

export interface LabourIndexData {
  month: Date;
  year: number;
  monthName: string;
  value: number;
  baseYear: number;
}

// Month name to number mapping
const MONTH_MAP: Record<string, number> = {
  'jan': 1, 'january': 1,
  'feb': 2, 'february': 2,
  'mar': 3, 'march': 3,
  'apr': 4, 'april': 4,
  'may': 5,
  'jun': 6, 'june': 6,
  'jul': 7, 'july': 7,
  'aug': 8, 'august': 8,
  'sep': 9, 'september': 9,
  'oct': 10, 'october': 10,
  'nov': 11, 'november': 11,
  'dec': 12, 'december': 12
};

/**
 * Parse Labour Bureau CSV data
 * CSV format: "S.No","Base Year","Survey Year","Survey Month","Index Value"
 */
export function parseLabourCSV(csvContent: string): LabourIndexData[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const result: LabourIndexData[] = [];
  
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Parse CSV line handling quoted values
    const values = line.match(/"([^"]*)"/g)?.map(v => v.replace(/"/g, '').trim()) || [];
    
    if (values.length < 5) continue;
    
    const baseYear = parseInt(values[1]);
    const year = parseInt(values[2]);
    const monthName = values[3].toLowerCase();
    const value = parseFloat(values[4]);
    
    if (isNaN(baseYear) || isNaN(year) || isNaN(value)) continue;
    
    const monthNum = MONTH_MAP[monthName];
    if (!monthNum) continue;
    
    // Create date as first day of month in UTC
    const month = new Date(Date.UTC(year, monthNum - 1, 1));
    
    result.push({
      month,
      year,
      monthName: values[3],
      value,
      baseYear
    });
  }
  
  // Sort by date descending (newest first)
  result.sort((a, b) => b.month.getTime() - a.month.getTime());
  
  return result;
}

/**
 * Parse the Labour Bureau's own page instead of a hand-carried CSV.
 *
 * The all-india-index page embeds the complete table in its HTML — the same five
 * columns the downloadable CSV holds (S.No, Base Year, Survey Year, Survey Month,
 * Index Value). Reading it directly removes the monthly ritual of downloading a CSV
 * and uploading it here: same data, same source, no courier.
 */
export function parseLabourHtmlTable(html: string): LabourIndexData[] {
  const result: LabourIndexData[] = [];

  // The report table's body: rows of five cells each.
  const tableMatch = html.match(/<table[^>]*id=["']report_data["'][\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tableMatch) return result;

  const rowRe = /<tr>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(tableMatch[1])) !== null) {
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length < 5) continue;

    const baseYear = parseInt(cells[1], 10);
    const year = parseInt(cells[2], 10);
    const monthNum = MONTH_MAP[cells[3].toLowerCase()];
    const value = parseFloat(cells[4]);
    if (isNaN(baseYear) || isNaN(year) || !monthNum || isNaN(value) || value <= 0) continue;

    result.push({
      month: new Date(Date.UTC(year, monthNum - 1, 1)),
      year,
      monthName: cells[3],
      value,
      baseYear,
    });
  }

  result.sort((a, b) => b.month.getTime() - a.month.getTime());
  return result;
}

/**
 * The Labour Bureau's certificate chain, pinned.
 *
 * The site is served under eMudhra/emSign CAs (an Indian CA the Vercel runtime does not
 * trust), so the nightly fetch died with "self-signed certificate in certificate chain"
 * while every browser accepted it. Rather than disabling TLS verification, the CA chain
 * observed from the live site is trusted explicitly — the leaf certificate still gets
 * verified against these and against the hostname, so a renewal keeps working and a
 * man-in-the-middle still fails. Only the CA certificates are pinned, never the leaf.
 */
const LABOUR_BUREAU_CA_CHAIN = "-----BEGIN CERTIFICATE-----\r\n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\r\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\r\nMIIEMjCCAxqgAwIBAgIBATANBgkqhkiG9w0BAQUFADB7MQswCQYDVQQGEwJHQjEb\r\nMBkGA1UECAwSR3JlYXRlciBNYW5jaGVzdGVyMRAwDgYDVQQHDAdTYWxmb3JkMRow\r\nGAYDVQQKDBFDb21vZG8gQ0EgTGltaXRlZDEhMB8GA1UEAwwYQUFBIENlcnRpZmlj\r\nYXRlIFNlcnZpY2VzMB4XDTA0MDEwMTAwMDAwMFoXDTI4MTIzMTIzNTk1OVowezEL\r\nMAkGA1UEBhMCR0IxGzAZBgNVBAgMEkdyZWF0ZXIgTWFuY2hlc3RlcjEQMA4GA1UE\r\nBwwHU2FsZm9yZDEaMBgGA1UECgwRQ29tb2RvIENBIExpbWl0ZWQxITAfBgNVBAMM\r\nGEFBQSBDZXJ0aWZpY2F0ZSBTZXJ2aWNlczCCASIwDQYJKoZIhvcNAQEBBQADggEP\r\nADCCAQoCggEBAL5AnfRu4ep2hxxNRUSOvkbIgwadwSr+GB+O5AL686tdUIoWMQua\r\nBtDFcCLNSS1UY8y2bmhGC1Pqy0wkwLxyTurxFa70VJoSCsN6sjNg4tqJVfMiWPPe\r\n3M/vg4aijJRPn2jymJBGhCfHdr/jzDUsi14HZGWCwEiwqJH5YZ92IFCokcdmtet4\r\nYgNW8IoaE+oxox6gmf049vYnMlhvB/VruPsUK6+3qszWY19zjNoFmag4qMsXeDZR\r\nrOme9Hg6jc8P2ULimAyrL58OAd7vn5lJ8S3frHRNG5i1R8XlKdH5kBjHYpy+g8cm\r\nez6KJcfA3Z3mNWgQIJ2P2N7Sw4ScDV7oL8kCAwEAAaOBwDCBvTAdBgNVHQ4EFgQU\r\noBEKIz6W8Qfs4q8p74Klf9AwpLQwDgYDVR0PAQH/BAQDAgEGMA8GA1UdEwEB/wQF\r\nMAMBAf8wewYDVR0fBHQwcjA4oDagNIYyaHR0cDovL2NybC5jb21vZG9jYS5jb20v\r\nQUFBQ2VydGlmaWNhdGVTZXJ2aWNlcy5jcmwwNqA0oDKGMGh0dHA6Ly9jcmwuY29t\r\nb2RvLm5ldC9BQUFDZXJ0aWZpY2F0ZVNlcnZpY2VzLmNybDANBgkqhkiG9w0BAQUF\r\nAAOCAQEACFb8AvCb6P+k+tZ7xkSAzk/ExfYAWMymtrwUSWgEdujm7l3sAg9g1o1Q\r\nGE8mTgHj5rCl7r+8dFRBv/38ErjHT1r0iWAFf2C3BUrz9vHCv8S5dIa2LX1rzNLz\r\nRt0vxuBqw8M0Ayx9lt1awg6nCpnBBYurDC/zXDrPbDdVCYfeU0BsWO/8tqtlbgT2\r\nG9w84FoVxp7Z8VlIMCFlA2zs6SFz7JsDoeA3raAVGI/6ugLOpyypEBMs1OUIJqsi\r\nl2D4kF501KKaU73yqWjgom7C12yxow+ev+to51byrvLjKzg6CYG1a4XXvi3tPxq3\r\nsmPi9WIsgtRqAEFQ8TmDn5XpNpaYbg==\r\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\r\nMIIGyzCCBLOgAwIBAgIPWUkUCeeX6paPBeD/Mx/sMA0GCSqGSIb3DQEBDAUAMFYx\r\nCzAJBgNVBAYTAklOMSUwIwYDVQQKDBxlTXVkaHJhIFRlY2hub2xvZ2llcyBMaW1p\r\ndGVkMSAwHgYDVQQDDBdlbVNpZ24gUm9vdCBUTFMgQ0EgLSBHMTAeFw0yNTA1Mjkw\r\nNzIzNDFaFw00MDA1MjgwNzIzNDFaMFMxCzAJBgNVBAYTAklOMSUwIwYDVQQKDBxl\r\nTXVkaHJhIFRlY2hub2xvZ2llcyBMaW1pdGVkMR0wGwYDVQQDDBRFTSBPViBUTFMg\r\nQ0EgLSBHMkEtMTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAO2PpAf8\r\nc7qXWx1YQmydsHiK1jxFEOL82M1yXpVOQGwUNy05OtC4YOpIuWYriOi6+L3W8mvg\r\nsa97lWE5MBv0VgTKUoJL2mazMgjY0gfKBBmAzNyM5NCnYlq0iolFnVKERYSN6ptW\r\n66drTr+iPwj488CpEu++9YkWQSXIqsJR5PqY9U5CupP/pp/46WnTdMMA6okpUvid\r\nFwSkPo3bGMbKwLSWi526gJqZGbFOzEkAf1qx0Z4kfafZaKlStiy6p8cTMJPVBXqU\r\nT1z26cxdxvcTWAg4squqoIZfSPzqkMo2ZIFrb/7o0t09SStXHCjh00oLE4CpIbsC\r\nzJr0itjCj8YIN3WW5lzecjQQDIXWXXdQqOU4HslaNRp5DGUv1Ral8VBAjzVpJRED\r\neL/pbsxka594qZw7KWbuZqN3o/D/ivWAa4jEl0CT5DkTbs82u6K8EwUlGtYxFC/X\r\nwLKY2Bn6l9l9WugEv7CCOZQoc28Q4rRu4BxM9OD41jcvgLdr1pZxzdH14F/X/UlC\r\nkTcx+kpVniP+EMq9iIZRSz4T/l0oS+XJcAH+skX7HawyGnH34wUXxFkPQJzU1LHc\r\n5WeLsd5s8IASQXiBxIt1TaLfyyUFxWLnmXMt14dIUYJhsDN3Wn28KpUVwnBwvLHJ\r\nT5cvQJCB3L8uIkXNzOFiBvXhHqmtTqYXu/HzAgMBAAGjggGXMIIBkzAfBgNVHSME\r\nGDAWgBRkHcnY+MTsBEsigfUyml6555NS+TAdBgNVHQ4EFgQUN8TSSvkoZUHO+JQT\r\nfyAV7qeAXTcwHQYDVR0lBBYwFAYIKwYBBQUHAwEGCCsGAQUFBwMCMF0GA1UdIARW\r\nMFQwOQYLKwYBBAGDjiEBAAEwKjAoBggrBgEFBQcCARYcaHR0cDovL3JlcG9zaXRv\r\ncnkuZW1zaWduLmNvbTANBgsrBgEEAYOOIQECbjAIBgZngQwBAgIwdgYIKwYBBQUH\r\nAQEEajBoMCQGCCsGAQUFBzABhhhodHRwOi8vb2NzcC1hLmVtc2lnbi5jb20wQAYI\r\nKwYBBQUHMAKGNGh0dHA6Ly9yZXBvc2l0b3J5LmVtc2lnbi5jb20vY2VydHMvRU1P\r\nVlRMU0NBRzJBMS5wN2MwNwYDVR0fBDAwLjAsoCqgKIYmaHR0cDovL2NybC5lbXNp\r\nZ24uY29tLz9yb290dGxzY2FnMS5jcmwwDgYDVR0PAQH/BAQDAgEGMBIGA1UdEwEB\r\n/wQIMAYBAf8CAQAwDQYJKoZIhvcNAQEMBQADggIBAJbm34Q8lrrOCLMFpCRvmNEN\r\nKdGDso4IGVbcrmyk66vAne2SvINDLX/oldg1I86HqijP7N0tC899hYLMAD3svlHn\r\n88h+zWAntD986ciR4MqZBjtZhSH3KlX3hxv96QjMP0vQvJ2mJiXqSqBs5evt2HfJ\r\nTrDhWZ9W7Kqq6zQmqYoNjWJRNtktuGcvv9A1xFIrIwI18uDAM0s4OMO8JYLt4Wt7\r\nNT/4tZYCQ/E+6VqEVkflXRwFPuNcQ3chnwpzQFtpgohpjz9SyZ59quStezTBcrh8\r\nnsC42M3fDQqgBdjWiMph99J15UAPUP9I3fr5pzJzU4xx36TeTo2D2WoEGplhmkW5\r\n5GBP7Q/a+1k2zY8unZpSqaeNAOmqSifkq1yV/yRp0YCg0TIi7bXjFXg/xOF5XICx\r\n4UkO/pBkUe5GFh+4BsIi5z1P/4Q6/mRS+F3X3AKqDkprhDpDtHHDyrq1tcSO7v7Q\r\nZsfZhTBBfXIUKZS/qfKYB76FwV7e2ObUaxwe+hY43CCaxMRBPGpiLtFSbb2UcjZT\r\nfmGjrVUoroczrYIo6+TfvC3IWIgZh7Iw5Verlss9acd/OAbQI3LABpxEu8bei32F\r\nJrHA05Pm8Lg042vWP40givmqPhfSdsouqxEzLsK4Y7jkZ1zz2PmVfmakU2m4LTZM\r\n4KV3lYXal1HR8w6Yq/dg\r\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\r\nMIIFuzCCBKOgAwIBAgIQAPerZVWeEIEt9khDR1hqJTANBgkqhkiG9w0BAQsFADBn\r\nMQswCQYDVQQGEwJJTjETMBEGA1UECxMKZW1TaWduIFBLSTElMCMGA1UEChMcZU11\r\nZGhyYSBUZWNobm9sb2dpZXMgTGltaXRlZDEcMBoGA1UEAxMTZW1TaWduIFJvb3Qg\r\nQ0EgLSBHMTAeFw0yNDA3MTExNDUyMjFaFw0zOTA3MDkxODMwMDBaMFYxCzAJBgNV\r\nBAYTAklOMSUwIwYDVQQKDBxlTXVkaHJhIFRlY2hub2xvZ2llcyBMaW1pdGVkMSAw\r\nHgYDVQQDDBdlbVNpZ24gUm9vdCBUTFMgQ0EgLSBHMTCCAiIwDQYJKoZIhvcNAQEB\r\nBQADggIPADCCAgoCggIBAMPm5mm136ImUw1EdfpP+tY0OmCgnH1eu6MvMr4P/isE\r\ndsRtmVjH653JHnPpPeUjGSbvLKGCabv9YvVBShZOvrI3GDIPrTguyUhONiygrjYS\r\nMcbkG0WouoPFybNE1IjYleAuQ8mdz5gsZ96lCfaAfmy1C9pidUBweF9KWQ31HzQb\r\nSak5T+0yqCyxNGZNdnrXodEwuH9kj+MOt3wL86K8KYH6CJv3uyhfa0UQw+Ho3tNH\r\n/DwdXs1m9FUViimqWd9GZcscYB7um484iVDVjimNd9cMY1bEMAFpCwzyycWvrjdj\r\nV74q48eCITrg41GSS6Wr0OxKBY3Mh1Yt+tl30MWQVcb0yZgt8e0Oq2a25LZYpTz7\r\neMBJ9+Zm+AJKE75vGKd0lwa68j9m8vb2+l1w3tbl1OAZGGA5D7FcBcGiIFAXm/aq\r\ns0lEYSZmp/UzGrwtswtPKnqhR87EolO+AMdvGJAnbhqsvrsX2FcxaV7Of2vIWDJ6\r\nhdpWaHa5YjNXpCgDpiaKRd5F6opQsb8WmQdUswZgIocLb4egKzR/ndYX6xlxnL/h\r\nU7W2HLqXckLR1HNCFz6wLgLuHmi7Zf3x760BbP0HwRIWryGUDJhAmh+gg3JNT/HR\r\nBL9bYpBKL7yjM+IJ70Q4tRFWwlpGMziRNNOLeOkem1DBxDl6+Q3A0v5R/HLVMG0p\r\nAgMBAAGjggFyMIIBbjAfBgNVHSMEGDAWgBT77w2GnrDj3am58SEXfz788HcrGjAd\r\nBgNVHQ4EFgQUZB3J2PjE7ARLIoH1MppeueeTUvkwHQYDVR0lBBYwFAYIKwYBBQUH\r\nAwEGCCsGAQUFBwMCMD0GA1UdIAQ2MDQwMgYEVR0gADAqMCgGCCsGAQUFBwIBFhxo\r\ndHRwOi8vcmVwb3NpdG9yeS5lbXNpZ24uY29tMHUGCCsGAQUFBwEBBGkwZzAiBggr\r\nBgEFBQcwAYYWaHR0cDovL29jc3AuZW1zaWduLmNvbTBBBggrBgEFBQcwAoY1aHR0\r\ncDovL3JlcG9zaXRvcnkuZW1zaWduLmNvbS9jZXJ0cy9lbVNpZ25Sb290Q0FHMS5j\r\ncnQwMwYDVR0fBCwwKjAooCagJIYiaHR0cDovL2NybC5lbXNpZ24uY29tP1Jvb3RD\r\nQUcxLmNybDAOBgNVHQ8BAf8EBAMCAQYwEgYDVR0TAQH/BAgwBgEB/wIBATANBgkq\r\nhkiG9w0BAQsFAAOCAQEABj/hFjkky/uOQZ0k3peoiVG7+qwhyC8TgaTLuDZisrnX\r\n7S1GvSeiOs8xeKyp8dnCbE6S1XHFtJbZi8PtSi+3haElYjkSiGixXd8PYLtNmCn9\r\ncK5ymSBVssavkolI3tONt1t2kzhyAaZItZqGOVJoeRxbSkM/vTKWKqlFYHn/J00u\r\nFG7ii70vEyF3Ly0scGHCpD1BFoYajQksxvQ1m3rtKKMwBucZNTejdA0Npf0iSiDX\r\n9HUrEEqodKnRLUMSQz4K0Bd1kB3AVn8tT5JAc1HlgmxQ1OTTz5NcX60ATo4eQIHT\r\na9Fb1/Op2vpQ/BhGF0vxOvg3nwleIchABUbyj9XnxQ==\r\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\r\nMIIDlDCCAnygAwIBAgIKMfXkYgxsWO3W2DANBgkqhkiG9w0BAQsFADBnMQswCQYD\r\nVQQGEwJJTjETMBEGA1UECxMKZW1TaWduIFBLSTElMCMGA1UEChMcZU11ZGhyYSBU\r\nZWNobm9sb2dpZXMgTGltaXRlZDEcMBoGA1UEAxMTZW1TaWduIFJvb3QgQ0EgLSBH\r\nMTAeFw0xODAyMTgxODMwMDBaFw00MzAyMTgxODMwMDBaMGcxCzAJBgNVBAYTAklO\r\nMRMwEQYDVQQLEwplbVNpZ24gUEtJMSUwIwYDVQQKExxlTXVkaHJhIFRlY2hub2xv\r\nZ2llcyBMaW1pdGVkMRwwGgYDVQQDExNlbVNpZ24gUm9vdCBDQSAtIEcxMIIBIjAN\r\nBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAk0u76WaK7p1b1TST0Bsew+eeuGQz\r\nf2N4aLTNLnF115sgxk0pvLZoYIr3IZpWNVrzdr3YzZr/k1ZLpVkGoZM0Kd0WNHVO\r\n8oG0x5ZOrRkVUkr+PHB1cM2vK6sVmjM8qrOLqs1D/fXqcP/tzxE7lM5OMhbTI0Aq\r\nd7OvPAEsbO2ZLIvZTmmYsvePQbAyeGHWDV/D+qJAkh1cF+ZwPjXnorfCYuKrpDhM\r\ntTk1b+oDafo6VGiFbdbyL0NVHpENDtjVaqSW0RM8LHhQ6DqS0hdW5TUaQBw+jSzt\r\nOd9C4INBdN+jzcKGYEho42kLVACL5HZpIQ15TjQIXhTCzLG3rdd8cIrHhQIDAQAB\r\no0IwQDAdBgNVHQ4EFgQU++8Nhp6w492pufEhF38+/PB3KxowDgYDVR0PAQH/BAQD\r\nAgEGMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAFn/8oz1h31x\r\nPaOfG1vR2vjTnGs2vZupYeveFix0PZ7mddrXuqe8QhfnPZHr5X3dPpzxz5KsbEjM\r\nwiI/aTvFthUvozXGaCocV685743QNcMYDHsAVhzNixl03r4PEuDQqqE/AjSxcM6d\r\nGNYIAwlG7mDgfrbESQRRfXBgvKqy/3lyeqYdPV8q+Mri/Tm3R7nrft8EI6/6nAYH\r\n6ftjk4BAtcZsCjEozgyfz7MjNYBBjWzEN3uBL4ChQEKF6dk4jeihU80Bv2noWgby\r\nRQuQ+q7hv53yrlc8pa6yVvSLZUDp/TGBLPQ5Cdjua6e0ph0VpZj3AYHYhX3zUVxx\r\niN66zB+Afko=\r\n-----END CERTIFICATE-----";

/** Fetch the Labour Bureau page and parse its embedded table. */
export async function fetchLabourIndexFromBureau(): Promise<LabourIndexData[]> {
  const url = 'https://labourbureau.gov.in/all-india-index';
  const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; IR-PVC/1.0; +https://irpvc.in)' };

  // First the ordinary way — if the platform's trust store ever accepts the chain,
  // nothing special happens.
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Labour Bureau answered ${res.status}`);
    return parseLabourHtmlTable(await res.text());
  } catch (err: any) {
    const message = String(err?.cause?.code || err?.message || err);
    if (!/SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|CERT_/i.test(message)) throw err;
  }

  // The runtime rejected the government CA — verify against the pinned chain instead.
  const { request } = await import('node:https');
  const html = await new Promise<string>((resolve, reject) => {
    const req = request(
      url,
      { headers, ca: LABOUR_BUREAU_CA_CHAIN, timeout: 30000 },
      (res) => {
        if ((res.statusCode || 0) >= 400) {
          reject(new Error(`Labour Bureau answered ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Labour Bureau timed out')));
    req.on('error', reject);
    req.end();
  });
  return parseLabourHtmlTable(html);
}

/**
 * Update Labour index in database from parsed data
 */
export async function updateLabourIndexFromData(
  data: LabourIndexData[],
  options: { isProvisional?: boolean; onlyMissing?: boolean } = {}
): Promise<{ updated: number; created: number; skipped: number }> {
  const { isProvisional = false, onlyMissing = false } = options;
  
  // Find the Labour price index
  const labourIndex = await prisma.priceIndex.findFirst({
    where: { name: 'Labour' }
  });
  
  if (!labourIndex) {
    throw new Error('Labour index not found in database. Please create it first.');
  }
  
  let updated = 0;
  let created = 0;
  let skipped = 0;
  
  for (const entry of data) {
    // Only process 2016 base year data
    if (entry.baseYear !== 2016) {
      skipped++;
      continue;
    }
    
    // Check if value exists for this month
    const existingValue = await prisma.monthlyIndexValue.findFirst({
      where: {
        priceIndexId: labourIndex.id,
        month: entry.month
      }
    });
    
    if (existingValue) {
      if (onlyMissing) {
        skipped++;
        continue;
      }
      
      // Update existing value
      await prisma.monthlyIndexValue.update({
        where: { id: existingValue.id },
        data: {
          value: entry.value,
          isProvisional,
          source: 'Labour Bureau CPI-IW',
          updatedAt: new Date()
        }
      });
      updated++;
    } else {
      // Create new value
      await prisma.monthlyIndexValue.create({
        data: {
          priceIndexId: labourIndex.id,
          month: entry.month,
          value: entry.value,
          isProvisional,
          source: 'Labour Bureau CPI-IW'
        }
      });
      created++;
    }
  }
  
  return { updated, created, skipped };
}

/**
 * Get preview of current Labour index data in database vs new data
 */
export async function getLabourIndexComparison(newData: LabourIndexData[]): Promise<{
  indexName: string;
  baseValue: number;
  entries: Array<{
    month: string;
    newValue: number;
    currentValue: number | null;
    needsUpdate: boolean;
  }>;
}> {
  const labourIndex = await prisma.priceIndex.findFirst({
    where: { name: 'Labour' }
  });
  
  if (!labourIndex) {
    throw new Error('Labour index not found in database');
  }
  
  // Get all current values
  const currentValues = await prisma.monthlyIndexValue.findMany({
    where: { priceIndexId: labourIndex.id },
    orderBy: { month: 'desc' }
  });
  
  const currentMap = new Map<string, number>();
  currentValues.forEach(v => {
    const key = v.month.toISOString().slice(0, 7); // YYYY-MM
    currentMap.set(key, v.value);
  });
  
  const entries = newData
    .filter(d => d.baseYear === 2016)
    .slice(0, 24) // Show last 24 months
    .map(d => {
      const monthKey = d.month.toISOString().slice(0, 7);
      const currentValue = currentMap.get(monthKey) || null;
      return {
        month: monthKey,
        newValue: d.value,
        currentValue,
        needsUpdate: currentValue === null || currentValue !== d.value
      };
    });
  
  return {
    indexName: 'Labour',
    baseValue: labourIndex.baseValue,
    entries
  };
}
