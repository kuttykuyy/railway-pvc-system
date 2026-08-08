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

/**
 * Carry a GSTIN that arrived AFTER payment into the Zoho side of the books.
 *
 * Zoho's invoice is created the moment payment verifies, with whatever GSTIN the
 * user's profile held — often none. The billing dialog collects the real one minutes
 * later, but it only reached the app's own PDF: the customer's input-credit claim and
 * the GSTR-1 both read from Zoho, which still said B2C. This finds the payment's Zoho
 * invoice by its reference number (the Razorpay order id it was created with), puts
 * the GSTIN on the contact, and corrects the invoice's GST treatment and place of
 * supply.
 *
 * Best-effort by contract: a paid or locked Zoho invoice may refuse edits, and that
 * refusal is reported, not thrown — the app-side invoice must not fail because the
 * ledger copy could not be touched.
 */
export async function syncGstinToZoho(params: {
  customerEmail: string;
  gstin: string;
  razorpayOrderId: string;
}): Promise<{ contactUpdated: boolean; invoiceUpdated: boolean; detail: string }> {
  const token = await getAccessToken();
  const gstin = params.gstin.trim().toUpperCase();
  const placeOfSupply = getStateFromGstin(gstin);

  // The contact carries the GSTIN in Zoho's model; the invoice carries the treatment.
  let contactUpdated = false;
  const searchRes = await fetch(
    `${ZOHO_API_BASE}/contacts?organization_id=${ORG_ID}&email=${encodeURIComponent(params.customerEmail)}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  const searchData = await searchRes.json();
  const contactId = searchData.contacts?.[0]?.contact_id;
  if (contactId) {
    const contactRes = await fetch(
      `${ZOHO_API_BASE}/contacts/${contactId}?organization_id=${ORG_ID}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gst_no: gstin, gst_treatment: 'business_gst' }),
      }
    );
    const contactData = await contactRes.json();
    contactUpdated = !!contactData.contact;
  }

  // The invoice was created with reference_number = the Razorpay order id — the one
  // handle that survives, since the Zoho invoice id was never stored.
  const invoiceSearchRes = await fetch(
    `${ZOHO_API_BASE}/invoices?organization_id=${ORG_ID}&reference_number=${encodeURIComponent(params.razorpayOrderId)}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  const invoiceSearchData = await invoiceSearchRes.json();
  const invoice = invoiceSearchData.invoices?.[0];
  if (!invoice) {
    return {
      contactUpdated,
      invoiceUpdated: false,
      detail: `No Zoho invoice found for order ${params.razorpayOrderId} — it may not have been created (Zoho was down at payment time?). The backfill can catch it.`,
    };
  }

  const updateBody: any = { gst_treatment: 'business_gst', gst_no: gstin };
  if (placeOfSupply) updateBody.place_of_supply = placeOfSupply;
  const updateRes = await fetch(
    `${ZOHO_API_BASE}/invoices/${invoice.invoice_id}?organization_id=${ORG_ID}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateBody),
    }
  );
  const updateData = await updateRes.json();
  const invoiceUpdated = !!updateData.invoice;
  return {
    contactUpdated,
    invoiceUpdated,
    detail: invoiceUpdated
      ? `Zoho invoice ${invoice.invoice_number} now carries GSTIN ${gstin}`
      : `Zoho refused the invoice update: ${updateData.message || 'unknown reason'}`,
  };
}
