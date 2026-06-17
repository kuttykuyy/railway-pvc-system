/**
 * Zoho Books integration — creates sales invoices after Razorpay payment
 * India region: accounts.zoho.in / www.zohoapis.in
 */

const ZOHO_TOKEN_URL = 'https://accounts.zoho.in/oauth/v2/token';
const ZOHO_API_BASE = 'https://www.zohoapis.in/books/v3';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID!;

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
  email: string
): Promise<string> {
  // Search by email
  const searchRes = await fetch(
    `${ZOHO_API_BASE}/contacts?organization_id=${ORG_ID}&email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  const searchData = await searchRes.json();

  if (searchData.contacts && searchData.contacts.length > 0) {
    return searchData.contacts[0].contact_id;
  }

  // Create new contact
  const createRes = await fetch(
    `${ZOHO_API_BASE}/contacts?organization_id=${ORG_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contact_name: name,
        contact_type: 'customer',
        email,
      }),
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
  creditAmount: number;   // base amount (excl. GST)
  gstAmount: number;
  totalAmount: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
}): Promise<ZohoInvoiceResult> {
  const token = await getAccessToken();
  const contactId = await findOrCreateContact(token, params.customerName, params.customerEmail);

  const invoiceBody = {
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
