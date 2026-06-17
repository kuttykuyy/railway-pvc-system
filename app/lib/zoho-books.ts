/**
 * Zoho Books integration — creates sales invoices after Razorpay payment
 * India region: accounts.zoho.in / www.zohoapis.in
 */

const ZOHO_TOKEN_URL = 'https://accounts.zoho.in/oauth/v2/token';
const ZOHO_API_BASE = 'https://www.zohoapis.in/books/v3';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID!;

// GSTIN state code (first 2 digits) → Zoho Books place_of_supply name
const GSTIN_STATE_MAP: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

export function getStateFromGstin(gstin?: string | null): string | null {
  if (!gstin || gstin.length < 2) return null;
  return GSTIN_STATE_MAP[gstin.substring(0, 2)] || null;
}

// Get a fresh access token using the refresh token
async function getAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${ZOHO_TOKEN_URL}?${params}`, { method: 'POST' });
  const data = await res.json();

  if (!data.access_token) {
    throw new Error(`Zoho token error: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// Find existing contact by email, or create one
async function findOrCreateContact(
  token: string,
  name: string,
  email: string,
  gstin?: string | null
): Promise<string> {
  const searchRes = await fetch(
    `${ZOHO_API_BASE}/contacts?organization_id=${ORG_ID}&email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  const searchData = await searchRes.json();

  if (searchData.contacts && searchData.contacts.length > 0) {
    return searchData.contacts[0].contact_id;
  }

  const contactBody: any = {
    contact_name: name,
    contact_type: 'customer',
    email,
  };
  if (gstin) contactBody.gst_no = gstin;

  const createRes = await fetch(
    `${ZOHO_API_BASE}/contacts?organization_id=${ORG_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contactBody),
    }
  );
  const createData = await createRes.json();

  if (!createData.contact?.contact_id) {
    throw new Error(`Failed to create Zoho contact: ${JSON.stringify(createData)}`);
  }
  return createData.contact.contact_id;
}

export interface ZohoInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
}

// Create a sales invoice in Zoho Books
export async function createZohoInvoice(params: {
  customerName: string;
  customerEmail: string;
  gstin?: string | null;
  creditAmount: number;
  gstAmount: number;
  totalAmount: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
}): Promise<ZohoInvoiceResult> {
  const token = await getAccessToken();
  const contactId = await findOrCreateContact(token, params.customerName, params.customerEmail, params.gstin);

  const placeOfSupply = getStateFromGstin(params.gstin);

  const invoiceBody: any = {
    customer_id: contactId,
    reference_number: params.razorpayOrderId,
    notes: `Razorpay Payment ID: ${params.razorpayPaymentId}`,
    line_items: [
      {
        name: 'PVC Bill Processing Service',
        description: 'Railway Contract Price Variation Clause (PVC) Calculation Service',
        rate: params.creditAmount,
        quantity: 1,
        tax_name: 'GST18',
        tax_percentage: 18,
      },
    ],
  };

  if (placeOfSupply) {
    invoiceBody.place_of_supply = placeOfSupply;
  }

  const res = await fetch(
    `${ZOHO_API_BASE}/invoices?organization_id=${ORG_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invoiceBody),
    }
  );

  const data = await res.json();

  if (!data.invoice?.invoice_id) {
    throw new Error(`Failed to create Zoho invoice: ${JSON.stringify(data)}`);
  }

  return {
    invoiceId: data.invoice.invoice_id,
    invoiceNumber: data.invoice.invoice_number,
    status: data.invoice.status,
  };
}
